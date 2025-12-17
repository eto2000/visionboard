import CanvasEditor from './components/CanvasEditor'
import { ToastProvider } from './components/ToastContext'

function App() {
  return (
    <ToastProvider>
      <div className="flex flex-col min-h-screen">
        <CanvasEditor />
      </div>
    </ToastProvider>
  )
}

export default App
