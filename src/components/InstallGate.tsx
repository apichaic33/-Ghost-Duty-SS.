import React, { useState, useEffect } from 'react';
import { Download, Share, Plus } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallGate({ children }: { children: React.ReactNode }) {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  const ua = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isMobile = isIOS || isAndroid;

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Listen for successful install
    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // Not yet determined
  if (isInstalled === null) return null;

  // Installed (standalone) or desktop → allow access
  if (isInstalled || !isMobile) return <>{children}</>;

  const handleAndroidInstall = async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setIsInstalled(true);
    setInstalling(false);
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6">
      {/* Icon */}
      <div className="w-24 h-24 rounded-3xl bg-orange-600 flex items-center justify-center shadow-xl mb-6">
        <span className="text-white text-3xl font-bold">ยำ</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-800 mb-1">ระบบยำกะผี</h1>
      <p className="text-sm text-gray-500 mb-8 text-center">กรุณาติดตั้งแอพบนหน้าจอโทรศัพท์ก่อนใช้งาน</p>

      {/* Android */}
      {isAndroid && (
        <div className="w-full max-w-xs space-y-4">
          {deferredPrompt ? (
            <button
              onClick={handleAndroidInstall}
              disabled={installing}
              className="w-full flex items-center justify-center gap-2 bg-orange-600 text-white py-3.5 rounded-2xl font-bold text-base shadow-lg hover:bg-orange-700 disabled:opacity-60 transition-colors"
            >
              <Download size={20} />
              {installing ? 'กำลังติดตั้ง...' : 'ติดตั้งแอพ'}
            </button>
          ) : (
            <div className="bg-white rounded-2xl p-5 border border-orange-200 shadow-sm space-y-3">
              <p className="text-sm font-bold text-gray-700 text-center">วิธีติดตั้งบน Android</p>
              <div className="space-y-2.5 text-sm text-gray-600">
                <Step n={1} text='กด ⋮ (เมนู 3 จุด) มุมขวาบน' />
                <Step n={2} text='"เพิ่มไปยังหน้าจอหลัก" หรือ "Install app"' />
                <Step n={3} text='กด "ติดตั้ง" เพื่อยืนยัน' />
                <Step n={4} text='เปิดแอพจากหน้าจอโทรศัพท์' />
              </div>
            </div>
          )}
        </div>
      )}

      {/* iOS */}
      {isIOS && (
        <div className="w-full max-w-xs">
          <div className="bg-white rounded-2xl p-5 border border-orange-200 shadow-sm space-y-3">
            <p className="text-sm font-bold text-gray-700 text-center">วิธีติดตั้งบน iPhone / iPad</p>
            <div className="space-y-2.5 text-sm text-gray-600">
              <Step n={1} icon={<Share size={14} className="text-blue-500 shrink-0" />} text='กดปุ่ม Share (กล่องมีลูกศรขึ้น) ด้านล่างจอ' />
              <Step n={2} icon={<Plus size={14} className="text-gray-700 shrink-0 border border-gray-400 rounded" />} text='"Add to Home Screen" / "เพิ่มบนหน้าจอโฮม"' />
              <Step n={3} text='กด "Add" มุมขวาบน เพื่อยืนยัน' />
              <Step n={4} text='เปิดแอพจาก icon บนหน้าจอโทรศัพท์' />
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-[11px] text-gray-400 text-center">
        การติดตั้งทำให้แอพทำงานเร็วขึ้น<br />และใช้งานได้เหมือน native app
      </p>
    </div>
  );
}

function Step({ n, text, icon }: { n: number; text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      {icon}
      <span>{text}</span>
    </div>
  );
}
