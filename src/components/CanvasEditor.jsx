import React, { useRef, useEffect, useState } from 'react';
import * as db from '../utils/indexedDB';
import { useToast } from './ToastContext';

const STORAGE_KEY = 'canvasImageEditorState';
const STORAGE_SELECTION_KEY = 'canvasActiveSelection';
const CONTROL_HANDLE_SIZE = 12;
const LINK_ICON_SIZE = 24;
const MIN_SIZE = 20;

const PASTEL_COLORS = [
    'transparent', // No background
    '#FFB3BA', // Red
    '#FFDFBA', // Orange
    '#FFFFBA', // Yellow
    '#BAFFC9', // Green
    '#BAE1FF', // Blue
    '#E6B3FF', // Purple
    '#FFCBA4', // Peach
    '#F0F8FF', // AliceBlue
];

export default function CanvasEditor() {
    const { showToast } = useToast();
    const canvasRef = useRef(null);
    const fileInputRef = useRef(null);
    const restoreInputRef = useRef(null);

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

    // Text editing state
    const [isTextSelected, setIsTextSelected] = useState(false);
    const [textContent, setTextContent] = useState('');
    const [textColor, setTextColor] = useState('#000000');
    const [textBackgroundColor, setTextBackgroundColor] = useState('transparent');
    const [textFontWeight, setTextFontWeight] = useState('bold');

    // Text Addition Modal State
    const [showAddTextModal, setShowAddTextModal] = useState(false);
    const [newTextContent, setNewTextContent] = useState('');
    const [newTextFontWeight, setNewTextFontWeight] = useState('bold');
    const [editingItemId, setEditingItemId] = useState(null);
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [isFullScreen, setIsFullScreen] = useState(false);

    // YouTube Modal State
    const [showYoutubeModal, setShowYoutubeModal] = useState(false);
    const [youtubeUrl, setYoutubeUrl] = useState('');

    const [showImageUrlModal, setShowImageUrlModal] = useState(false);
    const [imageUrl, setImageUrl] = useState('');
    const [showMenu, setShowMenu] = useState(false);

    const toggleFullScreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch((e) => {
                console.error(`Error attempting to enable full-screen mode: ${e.message} (${e.name})`);
            });
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            }
        }
    };

    useEffect(() => {
        const handleFullScreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', handleFullScreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullScreenChange);
        };
    }, []);

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

    const isPointInLinkIcon = (x, y, image) => {
        if (image !== selectedImageRef.current || !image.url) return false;

        const centerX = image.x + image.width / 2;
        const centerY = image.y + image.height / 2;
        const angle = -image.rotation;
        const sin = Math.sin(angle);
        const cos = Math.cos(angle);
        const dx = x - centerX;
        const dy = y - centerY;
        const rotatedX = dx * cos - dy * sin;
        const rotatedY = dx * sin + dy * cos;

        const iconHalfSize = LINK_ICON_SIZE / 2;
        const iconX = image.width / 2 - iconHalfSize;
        const iconY = -image.height / 2 + iconHalfSize;

        return rotatedX >= iconX - iconHalfSize &&
            rotatedX <= iconX + iconHalfSize &&
            rotatedY >= iconY - iconHalfSize &&
            rotatedY <= iconY + iconHalfSize;
    };

    // --- Drawing Functions ---

    const draw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        imagesRef.current.forEach(image => {
            if (image.type === 'text' || (image.img && image.img.complete)) {
                drawItem(ctx, image);
            }
            if (image === selectedImageRef.current) {
                drawControls(ctx, image);
            }
        });
    };

    const drawItem = (ctx, item) => {
        ctx.save();
        const centerX = item.x + item.width / 2;
        const centerY = item.y + item.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(item.rotation);

        if (item.type === 'text') {
            // Text drawing logic
            const fontSize = 100; // Base resolution for scaling
            const lineHeight = fontSize * 1.2;
            ctx.font = `${item.fontWeight || 'bold'} ${fontSize}px sans-serif`;
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            const lines = item.text.split('\n');
            let maxLineWidth = 0;
            lines.forEach(line => {
                const w = ctx.measureText(line).width;
                if (w > maxLineWidth) maxLineWidth = w;
            });

            // Ensure at least some width to prevent division by zero
            maxLineWidth = Math.max(maxLineWidth, fontSize);

            const totalReferenceHeight = lines.length * lineHeight;

            // Apply padding if background is present
            const padding = (item.backgroundColor && item.backgroundColor !== 'transparent') ? 40 : 0;
            const contentWidth = maxLineWidth + padding;
            const contentHeight = totalReferenceHeight + padding;

            // Scale to fit the bounding box
            const scaleX = item.width / contentWidth;
            const scaleY = item.height / contentHeight;

            ctx.scale(scaleX, scaleY);

            // Draw background if set
            if (item.backgroundColor && item.backgroundColor !== 'transparent') {
                ctx.fillStyle = item.backgroundColor;
                // Draw rectangle covering the entire content area
                const bgX = -contentWidth / 2;
                const bgY = -contentHeight / 2;
                ctx.fillRect(bgX, bgY, contentWidth, contentHeight);
            }

            ctx.fillStyle = item.color || '#000000';

            lines.forEach((line, index) => {
                const y = (index - (lines.length - 1) / 2) * lineHeight;
                ctx.fillText(line, 0, y);
            });
        } else {
            // Image drawing logic
            if (item.img) {
                ctx.drawImage(item.img, -item.width / 2, -item.height / 2, item.width, item.height);
            }
        }
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

        // YouTube/Link Icon at Top Right
        if (image.url) {
            ctx.save();
            const iconX = image.width / 2 - LINK_ICON_SIZE / 2;
            const iconY = -image.height / 2 + LINK_ICON_SIZE / 2;
            ctx.translate(iconX, iconY);

            // Background (Red Circle or Rounded Rect)
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(-LINK_ICON_SIZE / 2, -LINK_ICON_SIZE / 2, LINK_ICON_SIZE, LINK_ICON_SIZE, 4);
            } else {
                ctx.rect(-LINK_ICON_SIZE / 2, -LINK_ICON_SIZE / 2, LINK_ICON_SIZE, LINK_ICON_SIZE);
            }
            ctx.fill();

            // White Triangle
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            const triSize = LINK_ICON_SIZE * 0.4;
            ctx.moveTo(-triSize / 3, -triSize / 2.5);
            ctx.lineTo(-triSize / 3, triSize / 2.5);
            ctx.lineTo(triSize / 2, 0);
            ctx.fill();
            ctx.restore();
        }

        ctx.restore();
    };

    // --- Save/Load Functions ---

    const saveSelection = async (id) => {
        try {
            if (id) {
                await db.setItem(STORAGE_SELECTION_KEY, id.toString());
            } else {
                await db.removeItem(STORAGE_SELECTION_KEY);
            }
        } catch (e) {
            console.error("Failed to save selection:", e);
        }
    };

    const saveImages = async () => {
        try {
            const storableImages = imagesRef.current.map(img => ({
                x: img.x,
                y: img.y,
                width: img.width,
                height: img.height,
                rotation: img.rotation,
                name: img.name,
                base64Data: img.base64Data,
                id: img.id,
                type: img.type || 'image',
                text: img.text,
                color: img.color,
                backgroundColor: img.backgroundColor,
                fontWeight: img.fontWeight,
                url: img.url
            }));
            await db.setItem(STORAGE_KEY, JSON.stringify(storableImages));
        } catch (e) {
            console.error("Failed to save to localStorage:", e);
            if (e.name === 'QuotaExceededError') {
                alert("저장 공간이 부족합니다. 이미지를 줄이거나 캐시를 비워주세요.");
            }
        }
    };

    const loadImages = async () => {
        try {
            const storedData = await db.getItem(STORAGE_KEY);
            if (!storedData) return [];

            const loadedImagesData = JSON.parse(storedData);
            return Promise.all(loadedImagesData.map(data =>
                new Promise((resolve) => {
                    if (data.type === 'text') {
                        resolve(data);
                    } else {
                        const img = new Image();
                        img.crossOrigin = 'anonymous';
                        img.onload = () => resolve({ ...data, img });
                        img.onerror = () => resolve(null);
                        img.src = data.base64Data;
                    }
                })
            )).then(images => {
                const validImages = images.filter(Boolean);
                const uniqueImages = [];
                const seenIds = new Set();
                validImages.forEach(img => {
                    if (!seenIds.has(img.id)) {
                        seenIds.add(img.id);
                        uniqueImages.push(img);
                    }
                });
                return uniqueImages;
            });
        } catch (e) {
            console.error("Failed to load from localStorage:", e);
            return [];
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

    const getYoutubeId = (url) => {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/|live\/)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    };

    const addYoutubeThumbnail = async (url) => {
        const videoId = getYoutubeId(url);
        if (!videoId) {
            alert('올바른 유튜브 URL을 입력해주세요.');
            return;
        }

        // Try maxresdefault first, then hqdefault as fallback
        const tryLoadImage = (id, quality = 'maxresdefault') => {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    // Check if it's the 120x90 "not found" image
                    if (img.width === 120 && img.height === 90 && quality === 'maxresdefault') {
                        reject(new Error('Thumbnail not available in maxresdefault'));
                        return;
                    }
                    resolve(img);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
            });
        };

        try {
            let img;
            try {
                img = await tryLoadImage(videoId, 'maxresdefault');
            } catch (e) {
                img = await tryLoadImage(videoId, 'hqdefault');
            }

            // Convert to base64 for persistence and export
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const base64Data = canvas.toDataURL('image/jpeg');

            const scale = Math.min(1, Math.min(canvasSize.width / img.width / 2, canvasSize.height / img.height / 2));
            const newWidth = img.width * scale;
            const newHeight = img.height * scale;

            const newImage = {
                img: img,
                x: (canvasSize.width - newWidth) / 2,
                y: (canvasSize.height - newHeight) / 2,
                width: newWidth,
                height: newHeight,
                rotation: 0,
                name: `YouTube: ${videoId}`,
                base64Data: base64Data,
                url: url,
                id: Date.now() + Math.random(),
                type: 'image'
            };

            imagesRef.current.push(newImage);
            selectedImageRef.current = newImage;
            setSelectedImageName(newImage.name);
            saveImages();
            saveSelection(newImage.id);
            draw();
            setShowYoutubeModal(false);
            setYoutubeUrl('');
            showToast('유튜브 썸네일이 추가되었습니다.');
        } catch (error) {
            console.error("YouTube thumbnail failed:", error);
            alert("썸네일을 가져오는데 실패했습니다.");
        }
    };

    const addImageFromUrl = async (url) => {
        if (!url.trim()) {
            alert('URL을 입력해주세요.');
            return;
        }

        try {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                // Convert to base64 for persistence
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                let base64Data;
                try {
                    base64Data = canvas.toDataURL('image/webp', 0.8);
                } catch (e) {
                    console.warn("Could not convert image to base64 due to CORS. Using URL directly.", e);
                    base64Data = url; // Fallback to URL if CORS fails
                }

                const scale = Math.min(1, Math.min(canvasSize.width / img.width / 2, canvasSize.height / img.height / 2));
                const newWidth = img.width * scale;
                const newHeight = img.height * scale;

                const newImage = {
                    img: img,
                    x: (canvasSize.width - newWidth) / 2,
                    y: (canvasSize.height - newHeight) / 2,
                    width: newWidth,
                    height: newHeight,
                    rotation: 0,
                    name: `URL: ${url.substring(0, 30)}...`,
                    base64Data: base64Data,
                    id: Date.now() + Math.random(),
                    type: 'image'
                };

                imagesRef.current.push(newImage);
                selectedImageRef.current = newImage;
                setSelectedImageName(newImage.name);
                saveImages();
                saveSelection(newImage.id);
                draw();
                setShowImageUrlModal(false);
                setImageUrl('');
                showToast('이미지가 URL에서 추가되었습니다.');
            };
            img.onerror = () => {
                alert("이미지를 불러오는데 실패했습니다. URL을 확인하거나 CORS 정책을 확인해주세요.");
            };
            img.src = url;
        } catch (error) {
            console.error("Image URL expansion failed:", error);
            alert("이미지 처리 중 오류가 발생했습니다.");
        }
    };

    const handleFileInput = (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            files.forEach(file => loadImageFromFile(file));
            setShowMenu(false);
        }
        e.target.value = null; // Reset for same file selection
    };

    const handleExport = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Draw white background
        tempCtx.fillStyle = '#ffffff';
        tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

        // Draw items
        imagesRef.current.forEach(image => {
            if (image.type === 'text' || (image.img && image.img.complete)) {
                drawItem(tempCtx, image);
            }
        });

        // Download
        try {
            const dataUrl = tempCanvas.toDataURL('image/png');
            const link = document.createElement('a');
            const date = new Date();
            const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;
            link.download = `vision-board-${timestamp}.png`;
            link.href = dataUrl;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error("Export failed:", e);
            alert("이미지 저장 중 오류가 발생했습니다.");
        }
    };

    const handleResetClick = () => {
        setShowResetConfirm(true);
    };

    const confirmReset = async () => {
        imagesRef.current = [];
        selectedImageRef.current = null;
        setSelectedImageName('없음');
        await db.removeItem(STORAGE_KEY);
        await db.removeItem(STORAGE_SELECTION_KEY);
        setIsTextSelected(false);
        setTextContent('');
        setTextFontWeight('bold');
        draw();
        setShowResetConfirm(false);
    };

    const handleBackup = async () => {
        const storedData = await db.getItem(STORAGE_KEY);
        if (!storedData) {
            alert("저장된 데이터가 없습니다.");
            return;
        }

        const blob = new Blob([storedData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        const date = new Date();
        const timestamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}_${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
        link.download = `vision-board-backup-${timestamp}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleRestore = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                if (!Array.isArray(data)) throw new Error('Invalid backup format');

                const newImages = [];
                let loadedCount = 0;

                if (data.length === 0) {
                    imagesRef.current = [];
                    saveImages();
                    draw();
                    showToast('데이터가 성공적으로 복구되었습니다.');
                    setShowMenu(false);
                    return;
                }

                data.forEach(item => {
                    if (item.type === 'text') {
                        newImages.push(item);
                        loadedCount++;
                    } else {
                        const img = new Image();
                        img.onload = () => {
                            item.img = img;
                            newImages.push(item);
                            loadedCount++;
                            if (loadedCount === data.length) {
                                imagesRef.current = newImages;
                                saveImages();
                                draw();
                                showToast('데이터가 성공적으로 복구되었습니다.');
                                setShowMenu(false);
                            }
                        };
                        img.onerror = () => {
                            loadedCount++;
                            if (loadedCount === data.length) {
                                imagesRef.current = newImages;
                                saveImages();
                                draw();
                                showToast('데이터가 성공적으로 복구되었습니다.');
                                setShowMenu(false);
                            }
                        };
                        img.src = item.base64Data;
                    }
                });
            } catch (error) {
                console.error('Restore failed:', error);
                alert('복구 중 오류가 발생했습니다.');
            }
        };
        reader.readAsText(file);
        e.target.value = null;
    };

    const handleDoubleClick = (e) => {
        const pos = getMousePos(e);
        for (let i = imagesRef.current.length - 1; i >= 0; i--) {
            const image = imagesRef.current[i];
            if (isPointInImage(pos.x, pos.y, image)) {
                if (image.url) {
                    window.open(image.url, '_blank');
                }
                break;
            }
        }
    };

    const handleMouseDown = (e) => {
        e.preventDefault(); // Prevent scrolling on touch
        const pos = getMousePos(e);
        startPosRef.current = pos;

        let clickedImage = null;

        // Check handle and link icon first (reverse order)
        for (let i = imagesRef.current.length - 1; i >= 0; i--) {
            const image = imagesRef.current[i];

            if (isPointInLinkIcon(pos.x, pos.y, image)) {
                window.open(image.url, '_blank');
                return;
            }

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

            if (clickedImage.type === 'text') {
                setIsTextSelected(true);
                setTextContent(clickedImage.text);
                setTextColor(clickedImage.color || '#000000');
                setTextBackgroundColor(clickedImage.backgroundColor || 'transparent');
                setTextFontWeight(clickedImage.fontWeight || 'bold');
            } else {
                setIsTextSelected(false);
            }

            saveSelection(clickedImage.id); // Save selection
        } else {
            selectedImageRef.current = null;
            isDraggingRef.current = false;
            isResizingOrRotatingRef.current = false;
            isResizingOrRotatingRef.current = false;
            setSelectedImageName('없음');
            setIsTextSelected(false);
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
        let isMounted = true;
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

        loadImages().then(async images => {
            if (!isMounted) return;
            imagesRef.current = images;

            // Restore Selection
            const storedSelectionId = await db.getItem(STORAGE_SELECTION_KEY);
            if (storedSelectionId) {
                const selected = imagesRef.current.find(i => i.id.toString() === storedSelectionId);
                if (selected) {
                    selectedImageRef.current = selected;
                    setSelectedImageName(selected.name);
                }
            }
            draw();
        });

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
                selectedImageRef.current = null;
                setSelectedImageName('없음');
                setIsTextSelected(false);
                saveImages();
                saveSelection(null); // Clear selection
                draw();
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            isMounted = false;
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
            {/* 메뉴 토글 버튼 */}
            {!isFullScreen && (
                <button
                    onClick={() => setShowMenu(true)}
                    className="absolute top-4 left-4 z-20 p-3 bg-white/90 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 transition-all hover:bg-white text-gray-700 active:scale-95"
                    aria-label="메뉴 열기"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                </button>
            )}

            {/* 사이드바 배경 (클릭 시 닫기) */}
            {showMenu && !isFullScreen && (
                <div
                    className="absolute inset-0 z-30 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300"
                    onClick={() => setShowMenu(false)}
                />
            )}

            {/* 컨트롤 패널 - 사이드바 형태 */}
            <div className={`fixed top-0 left-0 bottom-0 z-40 w-72 bg-white/95 backdrop-blur-md shadow-2xl border-r border-gray-100 transform transition-transform duration-300 ease-in-out flex flex-col ${showMenu && !isFullScreen ? 'translate-x-0' : '-translate-x-full'} ${isFullScreen ? 'hidden' : ''}`}>
                <div className="p-6 flex flex-col h-full overflow-y-auto">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-2xl font-black text-indigo-600 tracking-tighter italic">VISION BOARD</h1>
                        <button
                            onClick={() => setShowMenu(false)}
                            className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <div className="space-y-6">
                        {/* 이미지 추가 세션 */}
                        <div className="space-y-3">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">추가하기</p>

                            <label htmlFor="fileInput"
                                className="flex items-center gap-3 cursor-pointer w-full px-4 py-3 text-sm font-semibold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 transition-all active:scale-[0.98]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                이미지 파일
                            </label>

                            <button
                                onClick={() => {
                                    setImageUrl('');
                                    setShowImageUrlModal(true);
                                    setShowMenu(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold rounded-xl text-white bg-blue-500 hover:bg-blue-600 shadow-md shadow-blue-100 transition-all active:scale-[0.98]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                                </svg>
                                URL 이미지
                            </button>

                            <button
                                onClick={() => {
                                    setNewTextContent('');
                                    setNewTextFontWeight('bold');
                                    setEditingItemId(null);
                                    setShowAddTextModal(true);
                                    setShowMenu(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold rounded-xl text-white bg-emerald-500 hover:bg-emerald-600 shadow-md shadow-emerald-100 transition-all active:scale-[0.98]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                텍스트 추가
                            </button>

                            <button
                                onClick={() => {
                                    setYoutubeUrl('');
                                    setShowYoutubeModal(true);
                                    setShowMenu(false);
                                }}
                                className="flex items-center gap-3 w-full px-4 py-3 text-sm font-semibold rounded-xl text-white bg-rose-500 hover:bg-rose-600 shadow-md shadow-rose-100 transition-all active:scale-[0.98]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                유튜브 썸네일
                            </button>
                        </div>

                        {/* 선택된 텍스트 편집 (조건부) */}
                        {isTextSelected && (
                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">텍스트 편집</p>
                                <div className="p-4 bg-gray-50 rounded-2xl space-y-4">
                                    <button
                                        onClick={() => {
                                            if (selectedImageRef.current && selectedImageRef.current.type === 'text') {
                                                setNewTextContent(selectedImageRef.current.text);
                                                setNewTextFontWeight(selectedImageRef.current.fontWeight || 'bold');
                                                setEditingItemId(selectedImageRef.current.id);
                                                setShowAddTextModal(true);
                                                setShowMenu(false);
                                            }
                                        }}
                                        className="w-full px-4 py-2 text-sm font-medium bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors shadow-sm"
                                    >
                                        내용 수정
                                    </button>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500 font-medium">글자 색상</span>
                                        <input
                                            type="color"
                                            value={textColor}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setTextColor(val);
                                                if (selectedImageRef.current && selectedImageRef.current.type === 'text') {
                                                    selectedImageRef.current.color = val;
                                                    saveImages();
                                                    draw();
                                                }
                                            }}
                                            className="w-8 h-8 rounded-lg cursor-pointer border border-gray-200 p-0.5"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <span className="text-xs text-gray-500 font-medium block">배경 색상</span>
                                        <div className="flex flex-wrap gap-2">
                                            {PASTEL_COLORS.map((color, index) => (
                                                <button
                                                    key={index}
                                                    onClick={() => {
                                                        setTextBackgroundColor(color);
                                                        if (selectedImageRef.current && selectedImageRef.current.type === 'text') {
                                                            selectedImageRef.current.backgroundColor = color;
                                                            saveImages();
                                                            draw();
                                                        }
                                                    }}
                                                    className={`w-7 h-7 rounded-full border border-gray-200 transition-all hover:scale-110 ${textBackgroundColor === color ? 'ring-2 ring-indigo-500 ring-offset-2' : ''}`}
                                                    style={{ backgroundColor: color === 'transparent' ? 'white' : color }}
                                                >
                                                    {color === 'transparent' && (
                                                        <div className="w-full h-full relative overflow-hidden rounded-full">
                                                            <div className="absolute inset-0 border-t border-red-500 transform rotate-45 top-1/2 left-0 w-full" style={{ marginTop: '-1px' }}></div>
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-gray-500 font-medium">글꼴 굵게</span>
                                        <button
                                            onClick={() => {
                                                const newWeight = textFontWeight === 'bold' ? 'normal' : 'bold';
                                                setTextFontWeight(newWeight);
                                                if (selectedImageRef.current && selectedImageRef.current.type === 'text') {
                                                    selectedImageRef.current.fontWeight = newWeight;
                                                    saveImages();
                                                    draw();
                                                }
                                            }}
                                            className={`px-4 py-2 text-sm border rounded-lg transition-all ${textFontWeight === 'bold' ? 'font-bold bg-indigo-50 border-indigo-200 text-indigo-600' : 'font-normal bg-white border-gray-200 text-gray-700'}`}
                                        >
                                            Bold
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 관리 세션 */}
                        <div className="space-y-3 pt-4 border-t border-gray-100">
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest pl-1">내보내기 & 관리</p>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={handleBackup}
                                    className="flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold rounded-xl text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all">
                                    백업
                                </button>
                                <label htmlFor="restoreInput"
                                    className="flex items-center justify-center gap-2 cursor-pointer px-4 py-3 text-xs font-bold rounded-xl text-gray-600 bg-gray-50 hover:bg-gray-100 border border-gray-100 transition-all text-center">
                                    불러오기
                                </label>
                            </div>

                            <button
                                onClick={handleExport}
                                className="flex items-center justify-center gap-3 w-full px-4 py-3 text-sm font-bold rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                이미지로 저장
                            </button>

                            <button
                                onClick={() => {
                                    toggleFullScreen();
                                    setShowMenu(false);
                                }}
                                className="flex items-center justify-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-all">
                                {isFullScreen ? '전체화면 해제' : '전체화면 보기'}
                            </button>

                            <button
                                onClick={() => {
                                    handleResetClick();
                                    setShowMenu(false);
                                }}
                                className="flex items-center justify-center gap-3 w-full px-4 py-3 text-sm font-medium rounded-xl text-rose-500 bg-rose-50 hover:bg-rose-100 transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                전체 초기화
                            </button>
                        </div>
                    </div>

                    <div className="mt-auto pt-8 pb-4 text-right pr-2">
                        <p className="text-[10px] text-gray-400 font-medium tracking-tight">soocoolkim@gmail.com</p>
                    </div>
                </div>

                {/* 숨겨진 Input 요소들 */}
                <div className="hidden">
                    <input
                        type="file"
                        id="fileInput"
                        ref={fileInputRef}
                        accept="image/*"
                        multiple
                        onChange={handleFileInput}
                    />
                    <input
                        type="file"
                        id="restoreInput"
                        ref={restoreInputRef}
                        accept=".json"
                        onChange={handleRestore}
                    />
                </div>
            </div>

            {/* 캔버스 영역 */}
            <div className="flex-1 w-full h-full bg-gray-50">
                <canvas
                    ref={canvasRef}
                    id="imageCanvas"
                    className="block touch-none"
                    onMouseDown={handleMouseDown}
                    onDoubleClick={handleDoubleClick}
                    onTouchStart={(e) => {
                        if (e.touches.length === 1) handleMouseDown(e);
                    }}
                />
            </div>

            {/* Text Input Modal */}
            {showAddTextModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 transform transition-all scale-100">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-lg font-bold text-gray-900">텍스트 추가</h2>
                            <button
                                onClick={() => setNewTextFontWeight(prev => prev === 'bold' ? 'normal' : 'bold')}
                                className={`px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100 transition-colors ${newTextFontWeight === 'bold' ? 'font-bold bg-gray-200 ring-2 ring-indigo-500 ring-offset-1' : 'font-normal'}`}
                            >
                                Bold
                            </button>
                        </div>
                        <textarea
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none h-32 text-gray-800 mb-4"
                            placeholder="내용을 입력하세요..."
                            value={newTextContent}
                            onChange={(e) => setNewTextContent(e.target.value)}
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowAddTextModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => {
                                    if (!newTextContent.trim()) {
                                        alert("내용을 입력해주세요.");
                                        return;
                                    }

                                    const text = newTextContent;
                                    const fontSize = 100;
                                    const lineHeight = fontSize * 1.2;
                                    const canvas = document.createElement('canvas'); // Temp for measurement
                                    const ctx = canvas.getContext('2d');
                                    ctx.font = `${newTextFontWeight} ${fontSize}px sans-serif`;

                                    const lines = text.split('\n');
                                    let maxLineWidth = 0;
                                    lines.forEach(line => {
                                        const w = ctx.measureText(line).width;
                                        if (w > maxLineWidth) maxLineWidth = w;
                                    });
                                    maxLineWidth = Math.max(maxLineWidth, fontSize);

                                    const width = maxLineWidth;
                                    const height = lines.length * lineHeight;

                                    if (editingItemId) {
                                        const foundIndex = imagesRef.current.findIndex(i => i.id === editingItemId);
                                        if (foundIndex !== -1) {
                                            const it = imagesRef.current[foundIndex];
                                            const oldCenterX = it.x + it.width / 2;
                                            const oldCenterY = it.y + it.height / 2;

                                            it.text = text;
                                            it.fontWeight = newTextFontWeight;
                                            it.name = text.length > 10 ? text.substring(0, 10) + '...' : text;
                                            it.width = width;
                                            it.height = height;
                                            it.x = oldCenterX - width / 2;
                                            it.y = oldCenterY - height / 2;

                                            selectedImageRef.current = it;
                                            setSelectedImageName(it.name);
                                            setIsTextSelected(true);
                                            setTextContent(text);
                                        }
                                    } else {
                                        const visibleColors = PASTEL_COLORS.filter(c => c !== 'transparent');
                                        const randomColor = visibleColors[Math.floor(Math.random() * visibleColors.length)];

                                        const newImage = {
                                            type: 'text',
                                            text: text,
                                            fontWeight: newTextFontWeight,
                                            color: '#000000',
                                            backgroundColor: randomColor,
                                            x: (canvasSize.width - width) / 2,
                                            y: (canvasSize.height - height) / 2,
                                            width: width,
                                            height: height,
                                            rotation: 0,
                                            name: text.length > 10 ? text.substring(0, 10) + '...' : text,
                                            id: Date.now() + Math.random()
                                        };
                                        imagesRef.current.push(newImage);
                                        selectedImageRef.current = newImage;
                                        setSelectedImageName(newImage.name);
                                        setIsTextSelected(true);
                                        setTextContent(newImage.text);
                                        setTextColor(newImage.color);
                                        setTextFontWeight(newImage.fontWeight);
                                    }

                                    saveImages();
                                    editingItemId ? saveSelection(editingItemId) : saveSelection(selectedImageRef.current.id);
                                    draw();
                                    setShowAddTextModal(false);
                                    setEditingItemId(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"
                            >
                                완료
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset Confirmation Modal */}
            {showResetConfirm && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-80 transform transition-all scale-100">
                        <h2 className="text-lg font-bold text-gray-900 mb-2">초기화 확인</h2>
                        <p className="text-sm text-gray-600 mb-6">
                            작업 중인 모든 내용이 삭제됩니다.<br />
                            정말 초기화하시겠습니까?
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={confirmReset}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
                            >
                                확인
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* YouTube URL Input Modal */}
            {showYoutubeModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 transform transition-all scale-100">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">유튜브 썸네일 추가</h2>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none text-gray-800 mb-4"
                            placeholder="유튜브 URL을 입력하세요 (예: https://youtu.be/...)"
                            value={youtubeUrl}
                            onChange={(e) => setYoutubeUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') addYoutubeThumbnail(youtubeUrl);
                            }}
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowYoutubeModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => addYoutubeThumbnail(youtubeUrl)}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm transition-colors"
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image URL Input Modal */}
            {showImageUrlModal && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl p-6 w-96 transform transition-all scale-100">
                        <h2 className="text-lg font-bold text-gray-900 mb-4">이미지 URL 추가</h2>
                        <input
                            type="text"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-800 mb-4"
                            placeholder="이미지 URL을 입력하세요"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') addImageFromUrl(imageUrl);
                            }}
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowImageUrlModal(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={() => addImageFromUrl(imageUrl)}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                            >
                                추가
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
