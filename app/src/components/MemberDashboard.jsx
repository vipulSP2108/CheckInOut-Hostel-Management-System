import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Key, MessageSquare, UserCheck, 
  Banknote, Wrench, LogOut, Building2, Plus, X, Menu,
  CreditCard, Calendar, CheckCircle, AlertCircle, Search, PackageCheck, Lock, Moon, Sun
} from 'lucide-react';
import { useTheme } from '../ThemeContext.jsx';

const API = (url, method = 'GET', body = null) =>
  fetch(url, {
    method,
    credentials: 'include',  // send HttpOnly cookie automatically
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Error')));

function Modal({ show, onClose, title, children }) {
  if (!show) return null;
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center z-50 p-4 pt-16 overflow-y-auto">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-gray-100 dark:border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-slate-700 bg-gray-50/50 dark:bg-slate-900/50 rounded-t-2xl">
          <h3 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-700 to-indigo-700">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30"><X size={20}/></button>
        </div>
        <div className="px-6 py-6 dark:bg-slate-800">{children}</div>
      </div>
    </div>
  );
}

function Inp({ label, ...p }) {
  return <div className="mb-4"><label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">{label}</label><input {...p} className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-slate-700 dark:text-white focus:bg-white dark:focus:bg-slate-600 outline-none transition-all shadow-sm" /></div>;
}

function Sel({ label, children, ...p }) {
  return <div className="mb-4"><label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">{label}</label><select {...p} className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-slate-700 dark:text-white focus:bg-white dark:focus:bg-slate-600 outline-none transition-all shadow-sm">{children}</select></div>;
}

function Txa({ label, ...p }) {
  return <div className="mb-4"><label className="block text-sm font-semibold text-gray-700 dark:text-slate-300 mb-1.5">{label}</label><textarea {...p} rows={3} className="w-full border border-gray-200 dark:border-slate-600 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-gray-50 dark:bg-slate-700 dark:text-white focus:bg-white dark:focus:bg-slate-600 outline-none resize-none transition-all shadow-sm" /></div>;
}

function Badge({ color, children }) {
  const c = { green:'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800', red:'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800', blue:'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800', yellow:'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800', orange:'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800', gray:'bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-300 border-gray-200 dark:border-slate-700', purple:'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800' };
  return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${c[color]||c.gray}`}>{children}</span>;
}

const sevBadge = s => s==='Critical'?<Badge color="red">{s}</Badge>:s==='High'?<Badge color="orange">{s}</Badge>:s==='Medium'?<Badge color="yellow">{s}</Badge>:<Badge color="gray">{s}</Badge>;
const stsBadge = s => (s==='Active'||s==='Open'||s==='Paid')?<Badge color="green">{s}</Badge>:(s==='In Progress'||s==='Pending')?<Badge color="blue">{s}</Badge>:(s==='Resolved'||s==='Completed')?<Badge color="purple">{s}</Badge>:(s==='Rejected'||s==='Closed'||s==='Overdue')?<Badge color="red">{s}</Badge>:<Badge color="gray">{s}</Badge>;

export default function MemberDashboard({ storedIdentificationNumber, onLogout }) {
  const { id: identificationNumber } = useParams();
  const { dark, toggle: toggleTheme } = useTheme();
  const [section, setSection] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [member, setMember] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [visitors, setVisitors] = useState([]);
  const [fees, setFees] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [furniture, setFurniture] = useState([]);
  
  const [compCats, setCompCats] = useState([]);
  const [feeCats, setFeeCats] = useState([]);
  const [wardens, setWardens] = useState([]);

  // Forms
  const [compForm, setCompForm] = useState({ CategoryID:'', Description:'', Severity:'Medium', RoomID:'' });
  const [visForm, setVisForm] = useState({ VisitorName:'', VisitorContact:'', Relation:'', Purpose:'', InDateTime:new Date().toISOString().slice(0,16) });
  const [maintForm, setMaintForm] = useState({ Description:'', RoomID:'' });
  const [cpForm, setCpForm] = useState({ oldPassword:'', newPassword:'', confirmPassword:'' });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [m, a, c, v, f, mx, cats, fcats, furn, h] = await Promise.all([
        API(`/api/members/${identificationNumber}`),
        API(`/api/allocations/member/${identificationNumber}`),
        API(`/api/complaints/member/${identificationNumber}`),
        API(`/api/visitors/member/${identificationNumber}`),
        API(`/api/fees/member/${identificationNumber}`),
        API(`/api/maintenance/member/${identificationNumber}`).catch(()=>[]), // If backend hasn't implemented this route yet
        API('/api/complaints/categories').catch(()=>[]),
        API('/api/fees/categories').catch(()=>[]),
        API(`/api/furniture/member/${identificationNumber}`).catch(()=>[]),
        API('/api/hostels/wardens').catch(()=>[])
      ]);
      setMember(m); setAllocations(a); setComplaints(c); setVisitors(v); setFees(f); setMaintenance(mx);
      setCompCats(cats); setFeeCats(fcats); setFurniture(furn||[]); setWardens(h||[]);
      
      const activeRoom = a.find(x => x.AllocationStatus === 'Active')?.RoomID || '';
      setCompForm(p => ({...p, RoomID: activeRoom}));
      setMaintForm(p => ({...p, RoomID: activeRoom}));
    } catch(e) {
      console.error(e);
      setError(e.toString());
    } finally {
      setLoading(false);
    }
  }, [identificationNumber]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleNewComplaint = async () => {
    try {
      await API('/api/complaints', 'POST', compForm);
      setModal(null);
      setCompForm(p=>({...p, Description:'', CategoryID:''}));
      fetchAll();
    } catch(e) { alert(e); }
  };

  const handleRegisterVisitor = async () => {
    try {
      await API('/api/visitors', 'POST', { ...visForm, IdentificationNumber: identificationNumber });
      setModal(null);
      setVisForm({ VisitorName:'', VisitorContact:'', Relation:'', Purpose:'', InDateTime:new Date().toISOString().slice(0,16) });
      fetchAll();
    } catch(e) { alert(e); }
  };

  const handleNewMaintenance = async () => {
    try {
      await API('/api/maintenance', 'POST', { ...maintForm, RequestedBy: identificationNumber });
      setModal(null);
      setMaintForm(p=>({...p, Description:''}));
      fetchAll();
    } catch(e) { alert(e); }
  };

  const handleChangePassword = async () => {
    if (cpForm.newPassword !== cpForm.confirmPassword) return alert('Passwords do not match');
    try {
      await API('/api/auth/change-password', 'POST', { oldPassword: cpForm.oldPassword, newPassword: cpForm.newPassword });
      alert('Password updated successfully!');
      setModal(null);
      setCpForm({ oldPassword:'', newPassword:'', confirmPassword:'' });
    } catch(e) { alert(e); }
  };

  const navItems = [
    {id:'overview',    label:'Dashboard',   icon:LayoutDashboard},
    {id:'allocations', label:'Room & Host', icon:Key},
    {id:'complaints',  label:'Complaints',  icon:MessageSquare},
    {id:'visitors',    label:'Visitors',    icon:UserCheck},
    {id:'fees',        label:'Fee Payments',icon:Banknote},
    {id:'maintenance', label:'Maintenance', icon:Wrench},
    {id:'furniture',   label:'Room Asset',  icon:PackageCheck},
  ];

  if (!member && loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0d1117]"><div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div></div>;
  if (error) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-[#0d1117] p-8 text-center">
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 p-8 rounded-3xl max-w-lg shadow-xl">
        <AlertCircle size={64} className="mx-auto mb-4 opacity-80" />
        <h2 className="text-3xl font-black mb-2 tracking-tight">Access Denied</h2>
        <p className="font-semibold">{error}</p>
        <p className="mt-4 text-sm opacity-80">RBAC Middleware blocked this request because you do not own this data.</p>
        <button onClick={onLogout} className="mt-6 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 px-6 rounded-xl transition-colors">Sign Out</button>
      </div>
    </div>
  );

  const activeAlloc = allocations.find(a => a.AllocationStatus === 'Active');

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-3xl p-8 text-white shadow-xl relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="absolute top-0 right-0 p-8 opacity-10"><Building2 size={160}/></div>
        
        <div className="relative z-10 flex flex-col md:flex-row items-center md:items-start gap-6 w-full">
          <div className="w-24 h-24 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center text-4xl font-bold shadow-inner border border-white/30 flex-shrink-0">
            {member?.Name?.charAt(0)}
          </div>
          <div>
            <h2 className="text-3xl font-extrabold mb-1">{member?.Name}</h2>
            <p className="text-blue-100 font-medium tracking-wide mb-3">{member?.Email} • {member?.ContactNumber}</p>
            <div className="flex flex-wrap gap-2 text-sm mt-1">
              <Badge color="blue">{member?.Department}</Badge>
              <Badge color="purple">Year {member?.YearOfStudy}</Badge>
              {activeAlloc ? (
                <span className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/30 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"><CheckCircle size={14}/> Active Resident</span>
              ) : (
                <span className="bg-red-500/20 text-red-100 border border-red-400/30 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5"><AlertCircle size={14}/> No Allocation</span>
              )}
            </div>
          </div>
        </div>

        {/* Digital QR Pass */}
        <div className="relative z-10 bg-white p-4 rounded-3xl shadow-2xl flex flex-col items-center flex-shrink-0 border-4 border-white/20">
          <div className="bg-white p-2 rounded-xl">
             <QRCode value={member?.QRCode || member?.IdentificationNumber || 'INVALID'} size={128} />
          </div>
          <p className="text-slate-800 text-xs font-bold mt-3 uppercase tracking-widest text-center">Digital Pass</p>
          <p className="text-slate-400 text-[10px] font-mono mt-0.5">{member?.QRCode || member?.IdentificationNumber}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl"><Key size={20}/></div><h3 className="font-bold text-gray-800 dark:text-white">Current Room</h3></div>
          {activeAlloc ? (
            <div>
              <p className="text-2xl font-black text-gray-800 dark:text-white mb-1">{activeAlloc.HostelName}</p>
              <p className="text-lg font-bold text-blue-600 mb-4">Room {activeAlloc.RoomNumber}</p>
              
              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-800 space-y-2 mb-4">
                <p className="text-[10px] font-black text-blue-400 dark:text-blue-500 uppercase tracking-widest mb-1">Hostel Warden</p>
                <p className="text-sm font-bold text-gray-800 dark:text-white">👤 {activeAlloc.WardenName || 'N/A'}</p>
                <p className="text-sm font-bold text-gray-600 dark:text-blue-300">
                  📞{" "}
                  {activeAlloc.WardenContact ? (
                    <a href={`tel:${activeAlloc.WardenContact}`} className="hover:text-blue-600 transition-colors">
                      {activeAlloc.WardenContact}
                    </a>
                  ) : (
                    "N/A"
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm text-gray-500 dark:text-slate-400">Check-in: {new Date(activeAlloc.CheckInDate).toLocaleDateString()}</p>
                <button onClick={() => setModal('wardenDir')} className="w-full mt-2 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 flex items-center gap-1.5 transition-colors">
                  <UserCheck size={14}/> View All Wardens Directory
                </button>
              </div>
            </div>
          ) : <p className="text-gray-400 text-sm italic py-4">No active room allocation.</p>}
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl"><AlertCircle size={20}/></div><h3 className="font-bold text-gray-800 dark:text-white">Recent Complaints</h3></div>
          <div className="space-y-3">
            {complaints.slice(0,3).map(c=>(
              <div key={c.ComplaintID} className="flex justify-between items-center text-sm">
                <span className="text-gray-600 dark:text-slate-300 font-medium truncate pr-2">{c.CategoryName}</span>
                {stsBadge(c.Status)}
              </div>
            ))}
            {complaints.length===0&&<p className="text-gray-400 text-sm italic py-4">No recent complaints.</p>}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-md transition-shadow">
          <div className="flex items-center gap-3 mb-4"><div className="p-3 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl"><Banknote size={20}/></div><h3 className="font-bold text-gray-800 dark:text-white">Fee Status</h3></div>
          <div className="space-y-3">
            {fees.slice(0,3).map(f=>(
               <div key={f.PaymentID} className="flex justify-between items-center text-sm">
                 <span className="text-gray-600 dark:text-slate-300 font-medium">{f.CategoryName}</span>
                 {stsBadge(f.Status)}
               </div>
            ))}
            {fees.length===0&&<p className="text-gray-400 text-sm italic py-4">No fee records.</p>}
          </div>
        </div>
      </div>
    </div>
  );

  const TblHead = ({cols}) => <thead><tr className="bg-gray-50/50 dark:bg-slate-900/60 border-b border-gray-100 dark:border-slate-700">{cols.map(h=><th key={h} className="text-left px-5 py-4 text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">{h}</th>)}</tr></thead>;
  const TblWrap = ({children, empty}) => <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-sm">{children}</table></div>{empty&&<div className="text-center py-16"><p className="text-gray-400 font-medium">{empty}</p></div>}</div>;
  const SectionHeader = ({title, btnLabel, onBtn}) => (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <h2 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">{title}</h2>
      {btnLabel && <button onClick={onBtn} className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-md shadow-blue-500/30 transition-all hover:shadow-lg"><Plus size={18}/>{btnLabel}</button>}
    </div>
  );

  const renderAllocations = () => (
    <div>
      <SectionHeader title="My Room Allocations" />
      <TblWrap empty={allocations.length===0?'No allocations found':null}>
        <TblHead cols={['Hostel', 'Room', 'Check-In', 'Check-Out', 'Status']} />
        <tbody>{allocations.map(a=>(
          <tr key={a.AllocationID} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="px-5 py-4 font-bold text-gray-800 dark:text-white">{a.HostelName}</td>
            <td className="px-5 py-4 font-semibold text-blue-600">Room {a.RoomNumber}</td>
            <td className="px-5 py-4 text-gray-600 dark:text-slate-300">
              <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-400"/> {new Date(a.CheckInDate).toLocaleDateString()}</div>
            </td>
            <td className="px-5 py-4 text-gray-600 dark:text-slate-300">
              {a.CheckOutDate ? <div className="flex items-center gap-2"><Calendar size={14} className="text-gray-400"/> {new Date(a.CheckOutDate).toLocaleDateString()}</div> : <span className="text-gray-400">—</span>}
            </td>
            <td className="px-5 py-4">{stsBadge(a.AllocationStatus)}</td>
          </tr>
        ))}</tbody>
      </TblWrap>
    </div>
  );

  const renderComplaints = () => (
    <div>
      <SectionHeader title="My Complaints" btnLabel="New Complaint" onBtn={()=>setModal('complaint')} />
      <TblWrap empty={complaints.length===0?'No complaints registered':null}>
        <TblHead cols={['ID', 'Category', 'Description', 'Severity', 'Status', 'Date']} />
        <tbody>{complaints.map(c=>(
          <tr key={c.ComplaintID} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="px-5 py-4 font-medium text-gray-500">#{c.ComplaintID}</td>
            <td className="px-5 py-4 font-bold text-gray-800 dark:text-white">{c.CategoryName}</td>
            <td className="px-5 py-4 text-gray-600 max-w-xs"><span className="truncate block" title={c.Description}>{c.Description}</span></td>
            <td className="px-5 py-4">{sevBadge(c.Severity)}</td>
            <td className="px-5 py-4">
              <div>
                {stsBadge(c.Status)}
                {c.ResolvedDate && <p className="text-[10px] font-bold text-emerald-600 mt-1">Resolved: {new Date(c.ResolvedDate).toLocaleDateString()}</p>}
              </div>
            </td>
            <td className="px-5 py-4 text-gray-500 text-xs font-medium">Raised: {c.RaisedDate?new Date(c.RaisedDate).toLocaleDateString():'—'}</td>
          </tr>
        ))}</tbody>
      </TblWrap>
    </div>
  );

  const renderVisitors = () => (
    <div>
      <SectionHeader title="My Visitors" btnLabel="Register Visitor" onBtn={()=>setModal('visitor')} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {visitors.length===0&&<div className="col-span-2 text-center py-16 bg-white dark:bg-slate-800 rounded-2xl border border-gray-100 dark:border-slate-700 shadow-sm"><p className="text-gray-400 font-medium">No visitors registered</p></div>}
        {visitors.map(v=>(
          <div key={v.VisitorID} className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 p-6 hover:shadow-md transition-all">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h4 className="font-bold text-lg text-gray-800 dark:text-white">{v.VisitorName}</h4>
                <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">{v.Relation}</p>
              </div>
              {!v.OutDateTime ? <Badge color="green">Active Visit</Badge> : <Badge color="gray">Completed</Badge>}
            </div>
            <div className="space-y-2 text-sm text-gray-600 bg-gray-50 dark:bg-slate-800 rounded-xl p-4">
              <p><span className="font-semibold text-gray-700 dark:text-slate-300">Contact:</span> {v.VisitorContact}</p>
              <p><span className="font-semibold text-gray-700 dark:text-slate-300">Purpose:</span> {v.Purpose}</p>
              <div className="border-t border-gray-200 dark:border-slate-600 mt-3 pt-3 flex flex-col gap-1">
                <span className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500"/> In: {new Date(v.InDateTime).toLocaleString()}</span>
                {v.OutDateTime && <span className="flex items-center gap-2"><CheckCircle size={14} className="text-gray-400"/> Out: {new Date(v.OutDateTime).toLocaleString()}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderFees = () => (
    <div>
      <SectionHeader title="Fee Payments" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-gradient-to-br from-green-500 to-emerald-600 dark:from-emerald-900/60 dark:to-green-900/40 border dark:border-emerald-800 rounded-2xl p-6 text-white shadow-lg">
          <p className="text-green-100 font-medium mb-1">Total Paid</p>
          <h3 className="text-3xl font-black">₹{fees.filter(f=>f.Status==='Paid').reduce((a,c)=>a+c.AmountPaid,0).toLocaleString()}</h3>
        </div>
      </div>
      <TblWrap empty={fees.length===0?'No fee records':null}>
        <TblHead cols={['ID', 'Category', 'Amount', 'Date', 'Status', 'Action']} />
        <tbody>{fees.map(f=>(
          <tr key={f.PaymentID} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
             <td className="px-5 py-4 font-medium text-gray-500">#{f.PaymentID}</td>
             <td className="px-5 py-4 font-bold text-gray-800 dark:text-white">{f.CategoryName}</td>
             <td className="px-5 py-4 font-black text-gray-800">₹{Number(f.AmountPaid).toLocaleString()}</td>
             <td className="px-5 py-4 text-gray-600 dark:text-slate-300">{f.PaymentDate?new Date(f.PaymentDate).toLocaleDateString():'—'}</td>
             <td className="px-5 py-4">{stsBadge(f.Status)}</td>
             <td className="px-5 py-4">
               {f.Status !== 'Paid' ? <button className="text-sm bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold px-4 py-2 rounded-lg transition-colors flex items-center gap-1"><CreditCard size={14}/> Pay</button> : <span className="text-gray-400 text-sm font-medium flex items-center gap-1"><CheckCircle size={14}/> Done</span>}
             </td>
          </tr>
        ))}</tbody>
      </TblWrap>
    </div>
  );

  const renderMaintenance = () => (
    <div>
      <SectionHeader title="Room Maintenance" btnLabel="Request Maintenance" onBtn={()=>setModal('maintenance')} />
      <TblWrap empty={maintenance.length===0?'No maintenance requests':null}>
        <TblHead cols={['ID', 'Room', 'Description', 'Status', 'Date']} />
        <tbody>{maintenance.map(mx=>(
          <tr key={mx.RequestID} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="px-5 py-4 font-medium text-gray-500">#{mx.RequestID}</td>
            <td className="px-5 py-4 font-bold text-blue-600">Room {mx.RoomNumber || 'N/A'}</td>
            <td className="px-5 py-4 text-gray-600 max-w-xs">{mx.Description}</td>
            <td className="px-5 py-4">
              <div>
                {stsBadge(mx.Status)}
                {mx.CompletedDate && <p className="text-[10px] font-bold text-emerald-600 mt-1">Finished: {new Date(mx.CompletedDate).toLocaleDateString()}</p>}
              </div>
            </td>
            <td className="px-5 py-4 text-gray-500 text-xs font-medium">Requested: {mx.RequestDate?new Date(mx.RequestDate).toLocaleDateString():'—'}</td>
          </tr>
        ))}</tbody>
      </TblWrap>
    </div>
  );

  const renderFurniture = () => (
    <div>
      <div className="flex items-center justify-between mb-4">
         <h3 className="font-bold text-gray-800 dark:text-white text-lg flex items-center gap-2"><div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-xl"><PackageCheck size={18}/></div> Assigned Room Inventory</h3>
      </div>
      <TblWrap empty={furniture.length===0?'No furniture recorded for your room':null}>
        <TblHead cols={['Asset', 'Type', 'Serial N.', 'Condition', 'Remarks']} />
        <tbody>{furniture.map(f=>(
          <tr key={f.FurnitureItemID} className="border-b border-gray-50 dark:border-slate-700/50 hover:bg-gray-50/50 dark:hover:bg-slate-700/30 transition-colors">
            <td className="px-5 py-4 font-bold text-gray-800 dark:text-white">ASSET-{f.FurnitureItemID}</td>
            <td className="px-5 py-4 text-indigo-600 font-bold">{f.TypeName}</td>
            <td className="px-5 py-4"><Badge color="gray">{f.SerialNumber||'N/A'}</Badge></td>
            <td className="px-5 py-4">{f.FurnitureCondition==='New'||f.FurnitureCondition==='Good'?<Badge color="green">{f.FurnitureCondition}</Badge>:<Badge color="red">{f.FurnitureCondition}</Badge>}</td>
            <td className="px-5 py-4 text-gray-500 text-xs italic">{f.Remarks||'—'}</td>
          </tr>
        ))}</tbody>
      </TblWrap>
    </div>
  );

  const sections = { overview:renderOverview, allocations:renderAllocations, complaints:renderComplaints, visitors:renderVisitors, fees:renderFees, maintenance:renderMaintenance, furniture:renderFurniture };
  const curNav = navItems.find(n=>n.id===section);

  return (
    <div className="flex h-screen bg-gray-50/50 dark:bg-[#0d1117] font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <aside className={`fixed lg:relative z-40 w-72 h-full bg-white dark:bg-[#0b0f19] border-r border-gray-200 dark:border-slate-800 flex flex-col flex-shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] transition-transform duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="px-6 py-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-2.5 shadow-lg shadow-blue-500/30">
              <Building2 size={24} className="text-white"/>
            </div>
            <div>
              <h1 className="text-gray-900 dark:text-white font-black text-xl tracking-tight">HostelMS</h1>
              <p className="text-indigo-600 text-xs font-bold tracking-widest uppercase">Member Portal</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>
        
        <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto">
          {navItems.map(item=>(
            <button key={item.id} onClick={()=>{setSection(item.id); setIsSidebarOpen(false);}} className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 ${section===item.id ? 'bg-blue-600 dark:bg-blue-600 text-white shadow-lg shadow-blue-900/40' : 'text-gray-500 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-white'}`}>
              <item.icon size={20} className={section===item.id?'text-white dark:text-white':'text-gray-400 dark:text-slate-500'}/>
              {item.label}
            </button>
          ))}
        </nav>
        
        <div className="p-4 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-2">
          <button onClick={()=>{setModal('password'); setIsSidebarOpen(false);}} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors shadow-sm">
            <Lock size={18}/> Change Password
          </button>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm">
            <LogOut size={18}/> Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col overflow-hidden relative w-full">
        <header className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200 dark:border-slate-700/60 px-4 md:px-8 py-5 flex items-center justify-between z-10 sticky top-0 shadow-sm">
          <div className="flex items-center gap-3">
             <button 
               onClick={() => setIsSidebarOpen(true)}
               className="lg:hidden p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
             >
               <Menu size={24} />
             </button>
             <h2 className="text-xl md:text-2xl font-black text-gray-800 dark:text-white">{curNav?.label}</h2>
          </div>
          <div className="flex items-center gap-4">
             <div className="hidden sm:block text-right">
               <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Logged in as:</p>
               <p className="font-bold text-gray-800 dark:text-white truncate max-w-[150px]">{member?.Name || 'Student'}</p>
             </div>
             <button
               onClick={toggleTheme}
               title={dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
               className="bg-gray-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 hover:text-blue-600 p-2.5 rounded-xl transition-all border border-gray-200 dark:border-slate-700"
             >
               {dark ? <Sun size={18}/> : <Moon size={18}/>}
             </button>
             <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-md cursor-pointer border-2 border-white">{member?.Name?.charAt(0)}</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-8 pb-20 bg-gray-50/50 dark:bg-[#0d1117]">
          <div className="max-w-6xl mx-auto">
             {sections[section]?.()}
          </div>
        </main>
      </div>

      <Modal show={modal==='complaint'} onClose={()=>setModal(null)} title="Lodge Complaint">
        <Sel label="Category *" value={compForm.CategoryID} onChange={e=>setCompForm(p=>({...p,CategoryID:e.target.value}))}>
          <option value="">Select category...</option>
          {compCats.map(c=><option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
        </Sel>
        <Inp label="Specific Room (Optional)" value={compForm.RoomID} disabled className="bg-gray-100 text-gray-500" placeholder="Auto-filled active room" />
        <Sel label="Severity *" value={compForm.Severity} onChange={e=>setCompForm(p=>({...p,Severity:e.target.value}))}>
          <option>Low</option><option>Medium</option><option>High</option><option>Critical</option>
        </Sel>
        <Txa label="Description *" value={compForm.Description} onChange={e=>setCompForm(p=>({...p,Description:e.target.value}))} placeholder="Elaborate on the issue..."/>
        <button onClick={handleNewComplaint} disabled={!compForm.CategoryID||!compForm.Description} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-50 mt-4">Submit Complaint</button>
      </Modal>

      <Modal show={modal==='visitor'} onClose={()=>setModal(null)} title="Register Visitor">
        <Inp label="Visitor's Full Name *" value={visForm.VisitorName} onChange={e=>setVisForm(p=>({...p,VisitorName:e.target.value}))}/>
        <div className="grid grid-cols-2 gap-4">
          <Inp label="Contact Number *" value={visForm.VisitorContact} onChange={e=>setVisForm(p=>({...p,VisitorContact:e.target.value}))}/>
          <Sel label="Relation *" value={visForm.Relation} onChange={e=>setVisForm(p=>({...p,Relation:e.target.value}))}>
            <option value="">Select...</option><option>Parent</option><option>Sibling</option><option>Guardian</option><option>Friend</option><option>Other</option>
          </Sel>
        </div>
        <Inp label="Expected Arrival *" type="datetime-local" value={visForm.InDateTime} onChange={e=>setVisForm(p=>({...p,InDateTime:e.target.value}))}/>
        <Txa label="Purpose of Visit *" value={visForm.Purpose} onChange={e=>setVisForm(p=>({...p,Purpose:e.target.value}))}/>
        <button onClick={handleRegisterVisitor} disabled={!visForm.VisitorName||!visForm.Relation||!visForm.Purpose} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-50 mt-4">Pre-register Visitor</button>
      </Modal>

      <Modal show={modal==='maintenance'} onClose={()=>setModal(null)} title="Request Maintenance">
        <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 p-4 rounded-xl mb-6 text-sm flex items-start gap-3 border border-blue-100 dark:border-blue-800"><Wrench size={18} className="mt-0.5"/><p><strong>Note:</strong> Maintenance requests are typically fulfilled within 24-48 hours. Urgent issues should be reported to the warden immediately.</p></div>
        <Inp label="Room ID" value={maintForm.RoomID} disabled className="bg-gray-100 text-gray-500" placeholder="Auto-filled active room" />
        <Txa label="Issue Details *" value={maintForm.Description} onChange={e=>setMaintForm(p=>({...p,Description:e.target.value}))} placeholder="Describe the maintenance required..."/>
        <button onClick={handleNewMaintenance} disabled={!maintForm.Description} className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-50 mt-4">Submit Request</button>
      </Modal>

      <Modal show={modal==='wardenDir'} onClose={() => setModal(null)} title="Hostel Warden Directory">
        <div className="space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">You can contact any hostel warden for emergency assistance if your assigned warden is unavailable.</p>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            {wardens.map((w, idx) => {
              const isActiveWarden = activeAlloc && w.HostelName === activeAlloc.HostelName;
              return (
                <div key={idx} className={`p-4 rounded-2xl border transition-all ${isActiveWarden ? 'bg-blue-50 border-blue-200 dark:bg-blue-900/20 dark:border-blue-800 ring-1 ring-blue-500/20' : 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-slate-800 dark:text-white">{w.WardenName}</h4>
                      <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-1">{w.HostelName}</p>
                    </div>
                    <a href={`tel:${w.WardenContact}`} className="p-2.5 bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 rounded-xl shadow-sm hover:scale-105 transition-transform border border-slate-100 dark:border-slate-600">
                      <UserCheck size={18}/>
                    </a>
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300">
                    <span className="opacity-50">Phone:</span> {w.WardenContact}
                  </div>
                  {isActiveWarden && <Badge color="blue" className="mt-3">Assigned to you</Badge>}
                </div>
              );
            })}
          </div>
          <button onClick={() => setModal(null)} className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl mt-4 transition-all hover:bg-slate-800">Close Directory</button>
        </div>
      </Modal>

      <Modal show={modal==='password'} onClose={()=>setModal(null)} title="Change Password">
        <Inp label="Current Password" type="password" value={cpForm.oldPassword} onChange={e=>setCpForm(p=>({...p,oldPassword:e.target.value}))}/>
        <Inp label="New Password" type="password" value={cpForm.newPassword} onChange={e=>setCpForm(p=>({...p,newPassword:e.target.value}))}/>
        <Inp label="Confirm New Password" type="password" value={cpForm.confirmPassword} onChange={e=>setCpForm(p=>({...p,confirmPassword:e.target.value}))}/>
        <button onClick={handleChangePassword} disabled={!cpForm.oldPassword||!cpForm.newPassword||!cpForm.confirmPassword} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-md disabled:opacity-50 mt-4">Update Password</button>
      </Modal>
    </div>
  );
}
