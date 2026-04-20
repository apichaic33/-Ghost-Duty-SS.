import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { auth, db } from './firebase';
import { Member, Shift, SwapRequest } from './types';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import Requests from './components/Requests';
import Members from './components/Members';
import Settings from './components/Settings';
import TeamSchedule from './components/TeamSchedule';
import { Toaster, toast } from 'sonner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [member, setMember] = useState<Member | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [initialRequestData, setInitialRequestData] = useState<any>(null);

  const navigateToRequest = (data: any) => {
    setInitialRequestData(data);
    setActiveTab('requests');
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const docRef = doc(db, 'members', u.uid);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          setMember({ id: docSnap.id, ...docSnap.data() } as Member);
        } else {
          // New user - allow basic setup if it's the first admin
          if (u.email?.toLowerCase() === 'q.apichai@gmail.com') {
             const newMember: Member = {
               id: u.uid,
               uid: u.uid,
               name: u.displayName || 'Admin',
               email: u.email || '',
               station: 'HQ',
               zone: 'Central',
               quotaA: 10,
               quotaH: 13,
               quotaX: 4,
               shiftPattern: 'S11,S11,S11,S11,S11,S11,X,X,S13,S13,S13,S13,S13,S13,X,X,S12,S12,X,X',
               cycleStartDate: new Date().toISOString().split('T')[0],
               role: 'admin'
             };
             try {
               await setDoc(docRef, newMember);
               setMember(newMember);
             } catch (e) {
               console.error("Error creating admin profile:", e);
               toast.error("ไม่สามารถสร้างโปรไฟล์ผู้ดูแลระบบได้");
             }
          }
        }
      } else {
        setMember(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed:', error);
      toast.error('เข้าสู่ระบบไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl text-center">
          <h1 className="text-3xl font-bold text-orange-600 mb-2">ระบบยำกะผี</h1>
          <p className="text-gray-500 mb-8">ระบบจัดการและสลับกะการทำงานนายสถานี</p>
          <button
            onClick={handleLogin}
            className="w-full bg-orange-600 text-white py-3 rounded-xl font-semibold hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2"
          >
            <span>เข้าสู่ระบบด้วย Google</span>
          </button>
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-xl text-center">
          <h1 className="text-2xl font-bold text-gray-800 mb-4">รอการอนุมัติ</h1>
          <p className="text-gray-600 mb-4">บัญชีของคุณยังไม่ได้รับการลงทะเบียนในระบบ กรุณาติดต่อผู้ดูแลระบบ</p>
          
          <div className="bg-gray-50 p-4 rounded-xl mb-6 text-left border border-gray-100">
            <p className="text-[10px] text-gray-400 uppercase font-bold mb-1">รหัสผู้ใช้ของคุณ (UID)</p>
            <code className="text-xs text-orange-600 break-all font-mono">{user.uid}</code>
            <p className="text-[10px] text-gray-400 mt-2">* ส่งรหัสนี้ให้ผู้ดูแลระบบเพื่อเพิ่มชื่อเข้าสู่ระบบ</p>
          </div>

          <button
            onClick={() => auth.signOut()}
            className="text-orange-600 font-medium hover:underline flex items-center justify-center space-x-1 mx-auto"
          >
            <span>ออกจากระบบ</span>
          </button>
        </div>
        <Toaster position="top-center" />
      </div>
    );
  }

  return (
    <Layout 
      activeTab={activeTab} 
      setActiveTab={setActiveTab} 
      isAdmin={member.role === 'admin'}
    >
      {activeTab === 'dashboard' && <Dashboard member={member} onSwapClick={navigateToRequest} />}
      {activeTab === 'team' && <TeamSchedule member={member} onSwapClick={navigateToRequest} isAdmin={member.role === 'admin'} />}
      {activeTab === 'requests' && (
        <Requests 
          member={member} 
          initialData={initialRequestData} 
          onClearInitialData={() => setInitialRequestData(null)} 
        />
      )}
      {activeTab === 'members' && member.role === 'admin' && <Members />}
      {activeTab === 'settings' && member.role === 'admin' && <Settings member={member} setMember={setMember} />}
      <Toaster position="top-center" />
    </Layout>
  );
}
