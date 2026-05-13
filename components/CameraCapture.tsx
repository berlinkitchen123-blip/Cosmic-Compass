import React, { useRef, useState, useCallback } from 'react';
import { Camera, X, RefreshCw, Check } from 'lucide-react';

interface CameraCaptureProps {
  onCapture: (base64Image: string) => void;
  onClose: () => void;
  title: string;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const startCamera = useCallback(async () => {
    setIsStarting(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please ensure you have granted permission.");
    } finally {
      setIsStarting(false);
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setCapturedImage(dataUrl);
        stopCamera();
      }
    }
  };

  const retake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const confirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
      onClose();
    }
  };

  React.useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
      <div className="glass bg-[#0f172a] rounded-[2.5rem] p-6 max-w-lg w-full border border-white/20 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-serif text-white flex items-center gap-2">
            <Camera size={20} className="text-indigo-400" /> {title}
          </h3>
          <button onClick={() => { stopCamera(); onClose(); }} className="text-gray-400 hover:text-white transition-colors">
            <X size={24} />
          </button>
        </div>

        <div className="relative aspect-square bg-black rounded-3xl overflow-hidden border border-white/10 mb-6">
          {!capturedImage ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
              {isStarting && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <RefreshCw size={32} className="text-indigo-500 animate-spin" />
                </div>
              )}
              {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-8 text-center">
                  <p className="text-red-400 text-sm mb-4">{error}</p>
                  <button onClick={startCamera} className="px-4 py-2 bg-indigo-600 rounded-xl text-xs font-bold uppercase tracking-widest">Retry</button>
                </div>
              )}
              <div className="absolute bottom-6 left-0 right-0 flex justify-center">
                <button
                  onClick={capturePhoto}
                  disabled={!stream}
                  className="w-16 h-16 bg-white rounded-full border-4 border-indigo-500/50 flex items-center justify-center hover:scale-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-12 h-12 bg-white rounded-full border-2 border-gray-200"></div>
                </button>
              </div>
            </>
          ) : (
            <>
              <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
              <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                <button
                  onClick={retake}
                  className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-2xl text-white text-xs font-bold uppercase tracking-widest transition-all"
                >
                  <RefreshCw size={14} /> Retake
                </button>
                <button
                  onClick={confirm}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl text-white text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-500/20 transition-all"
                >
                  <Check size={14} /> Use Photo
                </button>
              </div>
            </>
          )}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
        
        <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest font-bold">
          Position your {title.toLowerCase().includes('face') ? 'face' : 'palm'} clearly within the frame
        </p>
      </div>
    </div>
  );
};

export default CameraCapture;
