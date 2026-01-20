import CanvasEditor from './components/CanvasEditor'
import { ToastProvider } from './components/ToastContext'
import PWAUpdatePrompt from './components/PWAUpdatePrompt'
import InstallPrompt from './components/InstallPrompt'

function App() {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen">
        <InstallPrompt />
        <CanvasEditor />
        <PWAUpdatePrompt />
      </div>
    </ToastProvider>
  )
}

export default App
