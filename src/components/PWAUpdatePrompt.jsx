import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

function PWAUpdatePrompt() {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowUpdatePrompt(true);
    }
  }, [needRefresh]);

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setShowUpdatePrompt(false);
  };

  const handleUpdate = () => {
    updateServiceWorker(true);
    setShowUpdatePrompt(false);
  };

  if (!showUpdatePrompt && !offlineReady) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg p-4 z-50">
      {offlineReady && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">앱이 오프라인에서 사용할 준비가 되었습니다!</p>
          <button
            onClick={close}
            className="ml-4 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            확인
          </button>
        </div>
      )}
      
      {showUpdatePrompt && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-700">새 버전이 있습니다. 업데이트하시겠습니까?</p>
          <div className="flex gap-2 ml-4">
            <button
              onClick={close}
              className="px-3 py-1 text-sm bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              나중에
            </button>
            <button
              onClick={handleUpdate}
              className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              업데이트
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PWAUpdatePrompt;