import React, { useState, useEffect, useCallback } from 'react';
import { ImageIcon, Upload, Trash2, Loader2, CheckCircle } from 'lucide-react';
import { firebaseService } from '../../lib/firebaseService';

interface ImageControlProps {
  label: string;
  path: string;
  field: string;
  width: string;
  height: string;
  settings: Record<string, string | null>;
  uploading: string | null;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>, path: string) => Promise<void>;
  handleDelete: (path: string) => Promise<void>;
}

const ImageControl = ({ label, path, field, width, height, settings, uploading, handleUpload, handleDelete }: ImageControlProps) => {
  const currentUrl = settings[field];
  const isThisUploading = uploading === path;

  return (
    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col gap-3">
      <label className="text-sm font-bold text-gray-700">{label}</label>
      
      <div 
        className={`relative border-2 border-dashed border-gray-200 rounded-lg bg-white flex items-center justify-center overflow-hidden`}
        style={{ width: '100%', height: '120px' }}
      >
        {currentUrl ? (
          <img 
            src={currentUrl} 
            alt={label} 
            className="max-w-full max-h-full object-contain p-2"
            style={{ width, height }}
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-300">
            <ImageIcon size={32} />
            <span className="text-[10px]">미등록</span>
          </div>
        )}

        {isThisUploading && (
          <div className="absolute inset-0 bg-white/80 flex items-center justify-center backdrop-blur-[1px]">
            <Loader2 className="animate-spin text-[#1a3a6b]" />
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <label className="flex-1">
          <div className={`cursor-pointer bg-white border border-gray-200 hover:border-[#1a3a6b] hover:text-[#1a3a6b] px-3 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all ${isThisUploading ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload size={14} /> 파일 선택
          </div>
          <input 
            type="file" 
            accept="image/*" 
            className="hidden" 
            onChange={(e) => handleUpload(e, path)}
            disabled={isThisUploading}
          />
        </label>
        {currentUrl && (
          <button
            onClick={() => handleDelete(path)}
            disabled={isThisUploading}
            className="px-3 py-2 text-red-500 bg-white border border-red-100 hover:bg-red-50 rounded-lg transition-all"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
};

export default function GlobalImageManager() {
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    const data = await firebaseService.getGlobalSettings();
    setSettings(data as Record<string, string | null>);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      const data = await firebaseService.getGlobalSettings();
      if (isMounted) {
        setSettings(data as Record<string, string | null>);
        setLoading(false);
      }
    };
    init();
    return () => { isMounted = false; };
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, path: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setUploading(path);
      const url = await firebaseService.uploadImage(file, path);
      if (url) {
        await loadSettings();
        // Clear the input
        e.target.value = '';
      }
    } finally {
      setUploading(null);
    }
  };

  const handleDelete = async (path: string) => {
    if (!confirm('이미지를 삭제하시겠습니까?')) return;
    try {
      setUploading(path);
      await firebaseService.deleteImage(path);
      await loadSettings();
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setUploading(null);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <Loader2 className="animate-spin text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-[#1a3a6b] mb-2 px-1">
        <ImageIcon size={20} />
        <h3 className="font-bold">표준 양식 이미지 관리</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Form A Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#1a3a6b] px-6 py-4 text-white">
            <h4 className="font-bold flex items-center gap-2">
              <span className="bg-white/20 w-6 h-6 flex items-center justify-center rounded text-xs">A</span>
              형식 A — 협동조합 (웰쉐어사회적협동조합)
            </h4>
          </div>
          <div className="p-6 grid gap-4">
            <ImageControl 
              label="로고 (상단)"
              path="images/formA/logo.png"
              field="formA_logoUrl"
              width="100px"
              height="60px"
              settings={settings}
              uploading={uploading}
              handleUpload={handleUpload}
              handleDelete={handleDelete}
            />
            <ImageControl 
              label="직인 (하단)"
              path="images/formA/stamp.png"
              field="formA_stampUrl"
              width="80px"
              height="80px"
              settings={settings}
              uploading={uploading}
              handleUpload={handleUpload}
              handleDelete={handleDelete}
            />
          </div>
        </section>

        {/* Form B Section */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#2a4a7b] px-6 py-4 text-white">
            <h4 className="font-bold flex items-center gap-2">
              <span className="bg-white/20 w-6 h-6 flex items-center justify-center rounded text-xs">B</span>
              형식 B — 로지스 (㈜웰쉐어로지스)
            </h4>
          </div>
          <div className="p-6 grid gap-4">
            <ImageControl 
              label="로고 (상단)"
              path="images/formB/logo.png"
              field="formB_logoUrl"
              width="100px"
              height="60px"
              settings={settings}
              uploading={uploading}
              handleUpload={handleUpload}
              handleDelete={handleDelete}
            />
            <ImageControl 
              label="직인 (하단)"
              path="images/formB/stamp.png"
              field="formB_stampUrl"
              width="80px"
              height="80px"
              settings={settings}
              uploading={uploading}
              handleUpload={handleUpload}
              handleDelete={handleDelete}
            />
          </div>
        </section>
      </div>

      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 text-sm text-blue-800">
        <CheckCircle size={20} className="shrink-0 mt-0.5" />
        <p>
          이미지를 업로드하면 즉시 서버에 저장되며, 모든 사용자의 공문 미리보기에 실시간으로 반영됩니다.
          <br /> 로고는 가로형(3:1 권장), 직인은 정사각(1:1 권장, 배경 투명 PNG 권장) 이미지가 가장 적합합니다.
        </p>
      </div>
    </div>
  );
}
