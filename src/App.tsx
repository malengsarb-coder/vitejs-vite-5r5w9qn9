// src/App.tsx
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import './App.css';

// --- 1. ตั้งค่าการเชื่อมต่อฐานข้อมูล ---
const supabaseUrl = 'https://nswpjnyntinahskmdszw.supabase.co';
const supabaseAnonKey = 'sb_publishable_wMxk67vwRsIyYsPu97jj7Q_19Zl-mvs'; // <--- วาง Key ของคุณลงไป
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const [companies, setCompanies] = useState([]);
  const [orders, setOrders] = useState([]);
  
  const [selectedCompany, setSelectedCompany] = useState('');
  const [containerNo, setContainerNo] = useState('');
  const [branchCode, setBranchCode] = useState(''); // <--- เพิ่ม State สำหรับรหัสสาขา
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.email);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.email);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (profile) {
      fetchCompanies();
      fetchOrders();
      const channel = supabase.channel('public:orders').on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => { fetchOrders(); }).subscribe();
      return () => { supabase.removeChannel(channel); };
    }
  }, [profile]);

  const fetchProfile = async (userEmail) => {
    let { data } = await supabase.from('user_roles').select('*').eq('email', userEmail).single();
    if (data) setProfile(data);
  };
  
  const fetchCompanies = async () => {
    let { data } = await supabase.from('companies').select('*');
    if (data) setCompanies(data);
  };

  const getShiftRange = () => {
    const now = new Date();
    const shiftStart = new Date(now);
    shiftStart.setHours(6, 0, 0, 0);
    if (now.getHours() < 6) shiftStart.setDate(shiftStart.getDate() - 1);
    const shiftEnd = new Date(shiftStart);
    shiftEnd.setDate(shiftEnd.getDate() + 1);
    shiftEnd.setMilliseconds(-1);
    return { start: shiftStart.toISOString(), end: shiftEnd.toISOString(), label: `${shiftStart.toLocaleDateString('th-TH')} 06:00 - ${shiftEnd.toLocaleDateString('th-TH')} 05:59` };
  };

  const fetchOrders = async () => {
    const { start, end } = getShiftRange();
    let query = supabase.from('orders').select('*, companies(name)').gte('created_at', start).lte('created_at', end).order('created_at', { ascending: true });
    if (profile?.role === 'carrier') query = query.eq('company_id', profile.company_id);
    let { data } = await query;
    if (data) setOrders(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    const formattedEmail = email.includes('@') ? email : `${email}@example.com`;
    const { error } = await supabase.auth.signInWithPassword({ email: formattedEmail, password });
    if (error) alert('เข้าสู่ระบบล้มเหลว: กรุณาตรวจสอบชื่อผู้ใช้หรือรหัสผ่าน');
  };

  const handleLogout = async () => { await supabase.auth.signOut(); };

  const submitOrder = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from('orders').insert([{ 
      company_id: selectedCompany, 
      container_no: containerNo, 
      branch_code: branchCode, // <--- บันทึกรหัสสาขาลงฐานข้อมูล
      origin: origin, 
      destination: destination 
    }]);
    if (!error) { 
      setContainerNo(''); 
      setBranchCode(''); // <--- เคลียร์ค่าหลังสั่งงานเสร็จ
      setOrigin(''); 
      setDestination(''); 
    }
  };

  const markAsDone = async (id) => { 
    const { error } = await supabase.from('orders').update({ status: 'Done' }).eq('id', id);
    if (error) console.error(error); 
  };

  const getElapsedTimeInfo = (created_at) => {
    const startTime = new Date(created_at);
    const diffMs = currentTime.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    const isOverdue = diffMins > 30; 
    return { text: hours > 0 ? `${hours} ชม. ${mins} นาที` : `${mins} นาที`, isOverdue };
  };

  const pendingOrders = orders.filter(o => o.status === 'Pending');

  // ---------------- UI: หน้า Login ----------------
  if (!session) {
    return (
      <div className="login-wrapper">
        <div className="login-card">
          <h2 style={{ textAlign: 'center', marginBottom: '30px' }}>🔐 เข้าสู่ระบบ</h2>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div className="form-group">
              <label>ชื่อผู้ใช้งาน</label>
              <input type="text" placeholder="เช่น admin, prt, vcg" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>รหัสผ่าน</label>
              <input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="submit-btn" style={{marginTop: '10px'}}>เข้าสู่ระบบ</button>
          </form>
        </div>
      </div>
    );
  }

  // ---------------- UI: หน้า Dashboard หลัก ----------------
  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="brand-title">🚛 Shunt Truck Pro</h1>
        <div className="profile-section">
          👤 <strong>{email.split('@')[0]}</strong> 
          <span style={{color: '#888', fontSize: '13px'}}>({profile?.role})</span>
          <button onClick={handleLogout} className="logout-btn">ออกจากระบบ</button>
        </div>
      </header>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">🚚</div>
          <div className="stat-info">
            <h3>งานรอดำเนินการ</h3>
            <p>{pendingOrders.length}</p>
          </div>
        </div>
        {/* ซ่อน 2 กล่องนี้เมื่อเป็น Carrier */}
        {profile?.role === 'admin' && (
          <>
            <div className="stat-card">
              <div className="stat-icon" style={{background: '#d4edda', color: '#155724'}}>✅</div>
              <div className="stat-info">
                <h3>สำเร็จ (ในกะนี้)</h3>
                <p style={{color: '#28a745'}}>{orders.filter(o => o.status === 'Done').length}</p>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon" style={{background: '#fff3cd', color: '#856404'}}>⏱️</div>
              <div className="stat-info">
                <h3>เฉลี่ยเวลาต่อกะ</h3>
                <p>--</p>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ----------- หน้าของ ADMIN (ฟอร์มสั่งงาน) ----------- */}
      {profile?.role === 'admin' && (
        <div className="form-card">
          <h3>📝 สั่งงานใหม่</h3>
          <form onSubmit={submitOrder} className="form-grid">
            
            {/* แถวที่ 1: เลือกบริษัท (ขยายเต็ม 2 คอลัมน์) */}
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>บริษัทขนส่ง</label>
              <select value={selectedCompany} onChange={(e) => setSelectedCompany(e.target.value)} required>
                <option value="">-- เลือกบริษัท --</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* แถวที่ 2: ทะเบียนตู้ | สาขา */}
            <div className="form-group">
              <label>เลขทะเบียนตู้</label>
              <input placeholder="" value={containerNo} onChange={(e) => setContainerNo(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>รหัสสาขา</label>
              <input placeholder="" value={branchCode} onChange={(e) => setBranchCode(e.target.value)} required />
            </div>

            {/* แถวที่ 3: ต้นทาง | ปลายทาง */}
            <div className="form-group">
              <label>ต้นทาง (จุดรับตู้)</label>
              <input placeholder="" value={origin} onChange={(e) => setOrigin(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>ปลายทาง (จุดส่งตู้)</label>
              <input placeholder="" value={destination} onChange={(e) => setDestination(e.target.value)} required />
            </div>

            {/* ปุ่มกดส่งคำสั่ง */}
            <button type="submit" className="submit-btn" style={{ gridColumn: '1 / -1' }}>🚀 ส่งคำสั่งงาน</button>
          </form>
        </div>
      )}

      <div className="table-card">
        <div className="table-header">
          <h3>📋 คิวงาน</h3>
         
        </div>
        
        {pendingOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', background: '#fbfcfd', borderRadius: '8px', color: '#888' }}>
            🎉 ไม่มีคิวงานค้าง
          </div>
        ) : (
          <>
            {profile?.role === 'admin' ? (
              /* ----------- แบบฟอร์มตารางสำหรับ ADMIN ----------- */
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th style={{width: '40px'}}>#</th>
                      <th>หมายเลขตู้</th>
                      <th>รหัสสาขา</th>
                      <th>ขนส่ง</th>
                      <th>ต้นทาง</th>
                      <th>ปลายทาง</th>
                      <th>สั่งงานเมื่อ</th>
                      <th>เวลาที่ใช้ไป</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingOrders.map((order, index) => {
                      const timeInfo = getElapsedTimeInfo(order.created_at);
                      const carrierLogo = order.companies?.name.includes('PRT') ? '🔗' : '🚛';
                      return (
                        <tr key={order.id}>
                          <td style={{fontWeight: '600', color: '#888'}}>{index + 1}</td>
                          <td><span className="container-badge">{order.container_no}</span></td>
                          <td>
                            {order.branch_code ? (
                              <span className="branch-badge">{order.branch_code}</span>
                            ) : (
                              <span style={{color: '#ccc'}}>-</span>
                            )}
                          </td>
                          <td>
                            <div className="carrier-badge">
                              <span style={{fontSize: '18px'}}>{carrierLogo}</span>
                              {order.companies?.name}
                            </div>
                          </td>
                          <td><span className="loc-badge">📍 {order.origin}</span></td>
                          <td><span className="loc-badge">🏁 {order.destination}</span></td>
                          <td>{new Date(order.created_at).toLocaleTimeString('th-TH', {hour: '2-digit', minute:'2-digit'})} น.</td>
                          <td>
                            <span className={`timer-badge ${timeInfo.isOverdue ? 'danger' : ''}`}>
                              ⏱️ {timeInfo.text}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ----------- แบบฟอร์มการ์ดสำหรับ CARRIER ----------- */
              /* ---------------- รูปแบบแสดงผลสำหรับ CARRIER (ตารางกะทัดรัด) ---------------- */
              <div className="carrier-list-grid">
                {pendingOrders.map((order) => {
                  // แปลงรูปแบบเวลาให้เหมือนในรูปเป๊ะๆ (เช่น 24/5/2026 01.00)
                  const d = new Date(order.created_at);
                  const dateStr = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                  const timeStr = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }).replace(':', '.');
                  
                  return (
                    <div key={order.id} className="carrier-list-item">
                      
                      {/* แถวบน: Header */}
                      <div className="item-labels-top">
                        <div className="lbl-container">ทะเบียนตู้</div>
                        <div className="lbl-route">
                          <span>ต้นทาง</span>
                          <span>ปลายทาง</span>
                        </div>
                      </div>

                      {/* กล่องหลัก: กรอบดำ */}
                      <div className="item-main-box">
                        <div className="box-container">{order.container_no}</div>
                        <div className="box-route">
                          <span className="val-origin">{order.origin}</span>
                          <span className="val-arrow">➔</span>
                          <span className="val-dest">{order.destination}</span>
                        </div>
                        <div className="box-action">
                          <button onClick={() => markAsDone(order.id)} className="btn-done">
                            เสร็จ
                          </button>
                        </div>
                      </div>

                      {/* แถวล่าง: Footer */}
                      <div className="item-labels-bottom">
                        <div className="val-branch">{order.branch_code || ''}</div>
                        <div className="val-time">เวลาแจ้ง {dateStr} {timeStr}</div>
                      </div>

                    </div>
                  );
                })}
              </div>

            )}
          </>
        )}
      </div>
    </div>
  );
}