import React, { useState } from 'react';
import Card from './ui/Card';
import Button from './ui/Button';

const TwaDebugger: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    
    if (!isOpen) {
        return (
            <button 
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 left-4 bg-red-600 text-white text-[10px] px-2 py-1 rounded-full opacity-50 z-[9999] hover:opacity-100"
            >
                DEBUG
            </button>
        );
    }

    return (
        <div className="fixed inset-0 bg-black/90 z-[9999] p-4 flex flex-col font-mono text-[10px] text-green-400 overflow-hidden">
            <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-lg">TWA FULL DIAGNOSTICS</h2>
                <Button onClick={() => setIsOpen(false)} variant="secondary" className="!py-1 !px-2 text-[10px]">CLOSE</Button>
            </div>
            
            <div className="flex-1 overflow-y-auto space-y-4">
                <section>
                    <h3 className="border-b border-green-900 text-white font-bold">CLIENT STATE</h3>
                    <pre className="whitespace-pre-wrap break-all">
                        {JSON.stringify({
                            userAgent: navigator.userAgent,
                            url: window.location.href,
                            tgExists: !!window.Telegram,
                            twaExists: !!window.Telegram?.WebApp,
                            platform: window.Telegram?.WebApp?.platform || 'N/A',
                            initDataLength: window.Telegram?.WebApp?.initData?.length || 0,
                        }, null, 2)}
                    </pre>
                </section>

                <section>
                    <h3 className="border-b border-green-900 text-white font-bold">EVENT LOG</h3>
                    <div className="space-y-1">
                        {window.twaDebugLogs?.slice(-20).map((log, i) => (
                            <div key={i} className={log.level === 'error' ? 'text-red-400' : ''}>
                                [${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}
                            </div>
                        ))}
                    </div>
                </section>
                
                <section>
                    <h3 className="border-b border-green-900 text-white font-bold">SERVER STATUS</h3>
                    <Button onClick={async () => {
                        try {
                            const res = await fetch('/api/debug');
                            const data = await res.json();
                            alert(JSON.stringify(data, null, 2));
                        } catch (e) {
                            alert('Server Unreachable: ' + e);
                        }
                    }} variant="primary" className="mt-2 w-full !py-1 text-[10px]">Test Server Connectivity</Button>
                </section>
            </div>
        </div>
    );
};

export default TwaDebugger;