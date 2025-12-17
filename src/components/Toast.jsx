import React, { useEffect, useState } from 'react'

function Toast({ message, type = 'success', duration = 3000, onClose }) {
    const [isVisible, setIsVisible] = useState(false)
    const [isExiting, setIsExiting] = useState(false)

    useEffect(() => {
        // Trigger entrance animation
        requestAnimationFrame(() => {
            setIsVisible(true)
        })

        // Set timer for exit animation
        const exitTimer = setTimeout(() => {
            setIsExiting(true)
        }, duration - 300) // Start exit animation 300ms before closing

        // Set timer to close toast
        const closeTimer = setTimeout(() => {
            onClose()
        }, duration)

        return () => {
            clearTimeout(exitTimer)
            clearTimeout(closeTimer)
        }
    }, [duration, onClose])

    const getTypeStyles = () => {
        switch (type) {
            case 'success':
                return {
                    backgroundColor: '#10b981',
                    color: 'white'
                }
            case 'error':
                return {
                    backgroundColor: '#ef4444',
                    color: 'white'
                }
            case 'warning':
                return {
                    backgroundColor: '#f59e0b',
                    color: 'white'
                }
            case 'info':
                return {
                    backgroundColor: '#3b82f6',
                    color: 'white'
                }
            default:
                return {
                    backgroundColor: '#10b981',
                    color: 'white'
                }
        }
    }

    return (
        <div
            className={`toast ${isVisible && !isExiting ? 'toast-enter' : ''} ${isExiting ? 'toast-exit' : ''}`}
            style={{
                position: 'fixed',
                top: isVisible && !isExiting ? '20px' : '-100px',
                left: '50%',
                transform: 'translateX(-50%)',
                padding: '12px 24px',
                borderRadius: '8px',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                zIndex: 10000,
                fontSize: '14px',
                fontWeight: '500',
                transition: 'top 0.3s ease-out, opacity 0.3s ease-out',
                opacity: isVisible && !isExiting ? 1 : 0,
                minWidth: '200px',
                maxWidth: '400px',
                textAlign: 'center',
                pointerEvents: 'none',
                ...getTypeStyles()
            }}
        >
            {message}
        </div>
    )
}

export default Toast
