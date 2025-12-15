import React, { useRef, useEffect, useState } from 'react';

const STORAGE_KEY = 'canvasImageEditorState';
const STORAGE_SELECTION_KEY = 'canvasActiveSelection';
const CONTROL_HANDLE_SIZE = 12;
const MIN_SIZE = 20;

export default function CanvasEditor() {
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);

    // Use refs for mutable state to avoid re-renders during high-frequency events (drag/draw)
    const imagesRef = useRef([]);
    const isDraggingRef = useRef(false);
    const isResizingOrRotatingRef = useRef(false);
    const startPosRef = useRef({ x: 0, y: 0 });
    const originalPropsRef = useRef({});

    // State for UI updates
    const [selectedImageName, setSelectedImageName] = useState('없음');
    const [selectedImageId, setSelectedImageId] = useState(null);
    const selectedImageRef = useRef(null);
    const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });

    // --- Helper Functions ---

    const getMousePos = (event) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        let clientX, clientY;

        if (event.touches) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const isPointInImage = (x, y, image) => {
        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        const angle = -image.rotation;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const dx = x - centerX;
        const dy = y - centerY;
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;

        return rotatedX >= -image.width / 2 &&
            rotatedX <= image.width / 2 &&
            rotatedY >= -image.height / 2 &&
            rotatedY <= image.height / 2;
    };

    const isPointInHandle = (x, y, image) => {
        if (image !== selectedImageRef.current) return false;

        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        const angle = -image.rotation;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const dx = x - centerX;
        const dy = y - centerY;
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;

        const handleHalfSize = CONTROL_HANDLE_SIZE / 2;
        const handleLeft = image.width / 2 - handleHalfSize;
        const handleRight = image.width / 2 + handleHalfSize;
        const handleTop = image.height / 2 - handleHalfSize;
        const handleBottom = image.height / 2 + handleHalfSize;

        return rotatedX >= handleLeft &&
            rotatedX <= handleRight &&
            rotatedY >= handleTop &&
            rotatedY <= handleBottom;
    };

    // --- Drawing Functions ---

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        imagesRef.current.forEach(image => {
            if (image.img && image.img.complete) {
                drawImage(ctx, image);
            }
            if (image === selectedImageRef.current) {
                drawControls(ctx, image);
            }
        });
    };

    const drawImage = (ctx, image) => {
        ctx.save();
        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(image.rotation);
        ctx.drawImage(image.img, -image.width / 2, -image.height / 2, image.width, image.height);
        ctx.restore();
    };

    const drawControls = (ctx, image) => {
        ctx.save();
        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(image.rotation);

        // Border
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.strokeRect(-image.width / 2, -image.height / 2, image.width, image.height);

        // Handle
        const handleX = image.width / 2;
        const handleY = image.height / 2;
        ctx.fillStyle = isResizingOrRotatingRef.current ? '#ef4444' : '#3b82f6';
        ctx.beginPath();
        ctx.rect(handleX - CONTROL_HANDLE_SIZE / 2, handleY - CONTROL_HANDLE_SIZE / 2, CONTROL_HANDLE_SIZE, CONTROL_HANDLE_SIZE);
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        ctx.restore();
    };

    // --- Save/Load Functions ---

    const saveSelection = (id) => {
        try {
            if (id) {
                localStorage.setItem(STORAGE_SELECTION_KEY, id.toString());
            } else {
                localStorage.removeItem(STORAGE_SELECTION_KEY);
            }
        } catch (e) {
            console.error("Failed to save selection:", e);
        }
    };

    const saveImages = () => {
        try {
            const storableImages = imagesRef.current.map(img => ({
                x: img.x,
                y: img.y,
                width: img.width,
                height: img.height,
                rotation: img.rotation,
                name: img.name,
                base64Data: img.base64Data,
                id: img.id
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(storableImages));
        } catch (e) {
            console.error("Failed to save to localStorage:", e);
            if (e.name === 'QuotaExceededError') {
                alert("저장 공간이 부족합니다. 이미지를 줄이거나 캐시를 비워주세요.");
            }
        }
    };

    const loadImages = () => {
        try {
            const storedData = localStorage.getItem(STORAGE_KEY);
            const storedSelectionId = localStorage.getItem(STORAGE_SELECTION_KEY);

            if (storedData) {
                const loadedImagesData = JSON.parse(storedData);
                imagesRef.current = [];
                let imagesLoadedCount = 0;

                loadedImagesData.forEach(data => {
                    const img = new Image();
                    img.onload = () => {
                        imagesRef.current.push({
                            ...data,
                            img: img
                        });
                        imagesLoadedCount++;
                        if (imagesLoadedCount === loadedImagesData.length) {
                            // Restore Selection
                            if (storedSelectionId) {
                                const selected = imagesRef.current.find(i => i.id.toString() === storedSelectionId);
                                if (selected) {
                                    selectedImageRef.current = selected;
                                    setSelectedImageName(selected.name);
                                }
                            }
                            draw();
                        }
                    };
                    img.src = data.base64Data;
                });
            }
        } catch (e) {
            console.error("Failed to load from localStorage:", e);
        }
    };

    const compressImage = async (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const MAX_WIDTH = 1024;
                    const MAX_HEIGHT = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    // Compress to WebP with 0.8 quality
                    const compressedDataUrl = canvas.toDataURL('image/webp', 0.8);
                    resolve({
                        base64Data: compressedDataUrl,
                        width,
                        height
                    });
                };
            };
        });
    };

    const loadImageFromFile = async (file) => {
        try {
            const { base64Data, width, height } = await compressImage(file);

            const img = new Image();
            img.onload = () => {
                const scale = Math.min(1, Math.min(canvasSize.width / width / 2, canvasSize.height / height / 2));
                const newWidth = width * scale;
                const newHeight = height * scale;

                const newImage = {
                    img: img,
                    x: (canvasSize.width - newWidth) / 2,
                    y: (canvasSize.height - newHeight) / 2,
                    width: newWidth,
                    height: newHeight,
                    rotation: 0,
                    name: file.name,
                    base64Data: base64Data,
                    id: Date.now() + Math.random() // Unique ID
                };

                imagesRef.current.push(newImage);
                selectedImageRef.current = newImage;
                setSelectedImageName(newImage.name);
                saveImages();
                saveSelection(newImage.id); // Save selection immediately
                draw();
            };
            img.src = base64Data;
        } catch (error) {
            console.error("Image compression failed:", error);
            alert("이미지 처리 중 오류가 발생했습니다.");
        }
    };

    // --- Event Handlers ---

    const handleFileInput = (e) => {
        const files = Array.from(e.target.files);
        files.forEach(file => loadImageFromFile(file));
        e.target.value = '';
    };

    const handleClear = () => {
        imagesRef.current = [];
        selectedImageRef.current = null;
        setSelectedImageName('없음');
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(STORAGE_SELECTION_KEY);
        draw();
    };

    const handleMouseDown = (e) => {
        e.preventDefault(); // Prevent scrolling on touch
        const pos = getMousePos(e);
        startPosRef.current = pos;

        let clickedImage = null;

        // Check handle first (reverse order)
        for (let i = imagesRef.current.length - 1; i >= 0; i--) {
            const image = imagesRef.current[i];
            if (isPointInHandle(pos.x, pos.y, image)) {
                selectedImageRef.current = image;
                isResizingOrRotatingRef.current = true;
                isDraggingRef.current = false;

                originalPropsRef.current = {
                    x: image.x,
                    y: image.y,
                    width: image.width,
                    height: image.height,
                    rotation: image.rotation,
                    centerX: image.x + image.width / 2,
                    centerY: image.y + image.height / 2,
                    mouseAngle: Math.atan2(pos.y - (image.y + image.height / 2), pos.x - (image.x + image.width / 2))
                };

                setSelectedImageName(image.name);
                saveSelection(image.id); // Save (refresh) selection
                draw();
                return;
            }

            if (isPointInImage(pos.x, pos.y, image)) {
                clickedImage = image;
                break;
            }
        }

        if (clickedImage) {
            selectedImageRef.current = clickedImage;
            isDraggingRef.current = true;
            isResizingOrRotatingRef.current = false;

            // Move to top
            imagesRef.current = imagesRef.current.filter(img => img !== clickedImage);
            imagesRef.current.push(clickedImage);

            originalPropsRef.current = { x: clickedImage.x, y: clickedImage.y };
            setSelectedImageName(clickedImage.name);
            saveSelection(clickedImage.id); // Save selection
        } else {
            selectedImageRef.current = null;
            isDraggingRef.current = false;
            isResizingOrRotatingRef.current = false;
            setSelectedImageName('없음');
            saveSelection(null); // Clear selection
        }

        // Always save order changes if occurred (e.g. bring to front)
        if (clickedImage) saveImages();

        draw();
    };

    const handleMouseMove = (e) => {
        // This needs to be attached to window or have a capture mask, usually window is best for drag
        if (!selectedImageRef.current || (!isDraggingRef.current && !isResizingOrRotatingRef.current)) return;

        // e.preventDefault() is handled in 'touchstart' usually, but here if attached to window we might blocking everything. 
        // Better: prevent default if dragging.
        if (e.cancelable) e.preventDefault();

        const pos = getMousePos(e);
        const startX = startPosRef.current.x;
        const startY = startPosRef.current.y;
        const dx = pos.x - startX;
        const dy = pos.y - startY;

        const selectedImage = selectedImageRef.current;
        const originalProps = originalPropsRef.current;

        if (isDraggingRef.current) {
            selectedImage.x = originalProps.x + dx;
            selectedImage.y = originalProps.y + dy;
        } else if (isResizingOrRotatingRef.current) {
            const currentAngle = Math.atan2(pos.y - originalProps.centerY, pos.x - originalProps.centerX);
            selectedImage.rotation = originalProps.rotation + (currentAngle - originalProps.mouseAngle);

            const startDist = Math.hypot(startX - originalProps.centerX, startY - originalProps.centerY);
            const currentDist = Math.hypot(pos.x - originalProps.centerX, pos.y - originalProps.centerY);
            const scaleFactor = currentDist / startDist;

            const newWidth = originalProps.width * scaleFactor;
            const newHeight = originalProps.height * scaleFactor;

            if (newWidth > MIN_SIZE && newHeight > MIN_SIZE) {
                selectedImage.width = newWidth;
                selectedImage.height = newHeight;
                selectedImage.x = originalProps.centerX - selectedImage.width / 2;
                selectedImage.y = originalProps.centerY - selectedImage.height / 2;
            }
        }
        draw();
    };

    const handleMouseUp = () => {
        if (selectedImageRef.current && (isDraggingRef.current || isResizingOrRotatingRef.current)) {
            saveImages();
        }
        isDraggingRef.current = false;
        isResizingOrRotatingRef.current = false;
        originalPropsRef.current = {};
        draw();
    };

    // --- Effects ---

    useEffect(() => {
        const handleResize = () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;
            setCanvasSize({ width: newWidth, height: newHeight });

            // Update canvas DOM immediately to prevent flicker or clear
            if (canvasRef.current) {
                canvasRef.current.width = newWidth;
                canvasRef.current.height = newHeight;
                draw();
            }
        };

        window.addEventListener('resize', handleResize);

        // Initial load
        const canvas = canvasRef.current;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        loadImages();

        // Window event listeners for drag outside canvas
        const onMouseMove = (e) => handleMouseMove(e);
        const onMouseUp = () => handleMouseUp();

        // Touch events
        const onTouchMove = (e) => {
            if (e.touches.length === 1) handleMouseMove(e);
        };
        const onTouchEnd = () => handleMouseUp();

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd);
        window.addEventListener('touchcancel', onTouchEnd);

        window.addEventListener('touchcancel', onTouchEnd);

        // Keyboard events
        const handleKeyDown = (e) => {
            if (e.key === 'Backspace' && selectedImageRef.current) {
                const selectedImage = selectedImageRef.current;
                imagesRef.current = imagesRef.current.filter(img => img !== selectedImage);
                selectedImageRef.current = null;
                setSelectedImageName('없음');
                saveImages();
                saveSelection(null); // Clear selection
                draw();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('resize', handleResize);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onTouchEnd);
            window.removeEventListener('touchcancel', onTouchEnd);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    return (
        <div className="w-full h-screen flex flex-col relative overflow-hidden">

            {/* 컨트롤 패널 - Absolute position to float over or stay at top */}
            <div className="absolute top-4 left-4 right-4 z-10 flex flex-col sm:flex-row gap-4 p-4 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 max-w-fit mx-auto transition-all hover:bg-white">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                    <h1 className="text-xl font-extrabold text-gray-800 mr-4">Vision Board</h1>

                    <label htmlFor="fileInput"
                        className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition duration-150 ease-in-out w-full sm:w-auto">
                        <svg className="w-5 h-5 mr-2 -ml-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.5 13a4.5 4.5 0 01-9 0 4.5 4.5 0 019 0zm11-4a4.5 4.5 0 01-9 0 4.5 4.5 0 019 0zM12 2a2 2 0 00-2 2v1h4V4a2 2 0 00-2-2zM4 9a2 2 0 00-2 2v6a2 2 0 002 2h12a2 2 0 002-2v-6a2 2 0 00-2-2H4z"></path>
                        </svg>
                        사진 추가
                    </label>
                    <input
                        type="file"
                        id="fileInput"
                        ref={fileInputRef}
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileInput}
                    />

                    <button
                        onClick={handleClear}
                        className="px-4 py-2 text-sm font-medium rounded-lg text-red-600 bg-red-100 hover:bg-red-200 transition duration-150 ease-in-out w-full sm:w-auto">
                        초기화
                    </button>

                    <div className="text-sm font-medium text-gray-700">
                        <span className="font-semibold text-indigo-600">{selectedImageName !== '없음' ? selectedImageName : ''}</span>
                    </div>
                </div>
            </div>

            {/* 캔버스 영역 */}
            <div className="flex-1 w-full h-full bg-gray-50">
                <canvas
                    ref={canvasRef}
                    id="imageCanvas"
                    className="block touch-none"
                    onMouseDown={handleMouseDown}
                    onTouchStart={(e) => {
                        if (e.touches.length === 1) handleMouseDown(e);
                    }}
                />
            </div>
        </div>
    );
}
