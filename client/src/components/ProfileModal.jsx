import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Camera,
  Upload,
  Link as LinkIcon,
  Check,
  Sparkles,
  Shield,
  User,
  Trash2,
  AlertCircle
} from 'lucide-react';

export default function ProfileModal({ isOpen, onClose }) {
  const { user, updateProfile } = useAuth();
  const [selectedAvatar, setSelectedAvatar] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (user && isOpen) {
      setSelectedAvatar(user.avatar || '');
      setName(user.name || '');
      setCustomUrl('');
      setSuccessMsg('');
      setErrorMsg('');
    }
  }, [user, isOpen]);

  if (!isOpen || !user) return null;

  // Processar arquivo de foto do celular/computador com compressão em canvas
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Por favor selecione um arquivo de imagem válido (JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Redimensionar para no máximo 300x300 em formato quadrado compacto
        const canvas = document.createElement('canvas');
        const size = Math.min(img.width, img.height);
        const targetDim = 280;
        canvas.width = targetDim;
        canvas.height = targetDim;

        const ctx = canvas.getContext('2d');
        // Cortar proporcional no centro
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;
        ctx.drawImage(img, startX, startY, size, size, 0, 0, targetDim, targetDim);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
        setSelectedAvatar(compressedBase64);
        setCustomUrl('');
        setErrorMsg('');
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const handleApplyUrl = () => {
    if (!customUrl.trim()) return;
    setSelectedAvatar(customUrl.trim());
    setErrorMsg('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      await updateProfile({
        avatar: selectedAvatar,
        name: name.trim() || user.name
      });
      setSuccessMsg('Foto de perfil atualizada com sucesso!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setErrorMsg(err.message || 'Erro ao atualizar foto de perfil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Editar Perfil & Foto</h3>
              <p className="text-[10px] text-slate-400">Personalize seu avatar no Clube</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Conteúdo com Scroll */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Alertas */}
          {successMsg && (
            <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 animate-in fade-in">
              <Check className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 text-xs flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Prévia do Avatar Atual */}
          <div className="flex flex-col items-center justify-center space-y-3 py-2">
            <div className="relative group">
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full border-4 border-amber-500/60 shadow-xl overflow-hidden bg-slate-800 flex items-center justify-center">
                {selectedAvatar ? (
                  <img
                    src={selectedAvatar}
                    alt="Prévia do perfil"
                    className="w-full h-full object-cover"
                    onError={() => {
                      setErrorMsg('Não foi possível carregar a imagem deste endereço.');
                    }}
                  />
                ) : (
                  <User className="w-12 h-12 text-slate-500" />
                )}
              </div>

              {/* Botão de Câmera sobreposto */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 p-2.5 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg border-2 border-slate-900 transition active:scale-95"
                title="Tirar foto ou escolher da galeria"
              >
                <Camera className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center">
              <div className="font-extrabold text-sm text-white">{user.name}</div>
              <div className="text-[11px] text-amber-400 font-semibold flex items-center justify-center gap-1.5 mt-0.5">
                <Shield className="w-3 h-3" />
                <span>{user.club_role || (user.role === 'superadmin' ? 'Pastor / Diretor Geral' : user.role === 'director' ? 'Diretoria' : 'Desbravador')}</span>
                {user.team_name && <span>• Unidade {user.team_name}</span>}
              </div>
            </div>
          </div>

          {/* Upload Direto da Galeria / Câmera */}
          <div className="space-y-2">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition active:scale-95"
            >
              <Upload className="w-4 h-4" />
              Escolher Foto da Galeria do Celular ou Tirar Foto
            </button>

            {selectedAvatar ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedAvatar('');
                  setCustomUrl('');
                }}
                className="w-full py-2 text-xs font-semibold text-slate-400 hover:text-red-400 transition text-center"
              >
                Remover foto atual (usar inicial do nome)
              </button>
            ) : null}
          </div>

          {/* Opção Secundária: Link de Imagem Web */}
          <details className="text-xs text-slate-400 cursor-pointer pt-1">
            <summary className="hover:text-slate-200">Ou colar link direto de imagem da internet</summary>
            <div className="flex gap-2 mt-2">
              <div className="relative flex-1">
                <LinkIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="url"
                  placeholder="https://exemplo.com/foto.jpg"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
              <button
                type="button"
                onClick={handleApplyUrl}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition shrink-0"
              >
                Aplicar
              </button>
            </div>
          </details>
        </div>

        {/* Rodapé de Ações */}
        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-950/80 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 transition active:scale-95 disabled:opacity-50"
          >
            {loading ? (
              <>Salvando...</>
            ) : (
              <>
                <Check className="w-4 h-4 stroke-[3]" />
                Salvar Foto
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
