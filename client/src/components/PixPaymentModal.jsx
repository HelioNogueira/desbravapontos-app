import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Copy, Check, QrCode, MessageCircle } from 'lucide-react';
import { generatePixPayload } from '../utils/pix';

export default function PixPaymentModal({ isOpen, onClose, club, pixKey = '92994020715', whatsappNumber = '5592994020715' }) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const amount = Number(club?.monthly_price || 39.9);
  const pixCode = generatePixPayload({
    key: pixKey,
    amount,
    merchantName: 'DESBRAVAPONTOS',
    city: 'MANAUS',
    txid: club?.join_code || `CLUBE${club?.id || 1}`
  });

  useEffect(() => {
    if (!isOpen) return;
    QRCode.toDataURL(pixCode, {
      width: 260,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' }
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [isOpen, pixCode]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard?.writeText(pixCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 space-y-4">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold">
            <QrCode className="w-3.5 h-3.5" />
            Pagamento via Pix
          </div>
          <h3 className="text-lg font-black text-white">
            Renovação — {club?.name || 'Seu Clube'}
          </h3>
          <p className="text-xs text-slate-400">
            Valor da mensalidade: <strong className="text-amber-400 text-sm">R$ {amount.toFixed(2).replace('.', ',')}</strong>
          </p>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="p-3 bg-white rounded-2xl shadow-lg">
            {qrDataUrl ? (
              <img src={qrDataUrl} alt="QR Code Pix" className="w-48 h-48 sm:w-52 sm:h-52" />
            ) : (
              <div className="w-48 h-48 flex items-center justify-center text-slate-500 text-xs">
                Gerando QR Code...
              </div>
            )}
          </div>
        </div>

        <p className="text-[11px] text-center text-slate-400">
          Abra o app do seu banco, escolha <strong>Pix → Ler QR Code</strong> ou use o código <strong>Copia e Cola</strong> abaixo:
        </p>

        {/* Pix Copia e Cola */}
        <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Pix Copia e Cola
          </div>
          <div className="text-[11px] font-mono text-slate-300 break-all max-h-16 overflow-y-auto select-all">
            {pixCode}
          </div>
          <button
            onClick={handleCopy}
            className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition"
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Código Pix Copiado!' : 'Copiar Código Pix'}
          </button>
        </div>

        <a
          href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Olá! Segue o comprovante Pix de renovação do clube ${club?.name || ''} (${club?.join_code || ''}) no valor de R$ ${amount.toFixed(2).replace('.', ',')}.`)}`}
          target="_blank"
          rel="noreferrer"
          className="w-full py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition"
        >
          <MessageCircle className="w-4 h-4" />
          Enviar Comprovante no WhatsApp
        </a>
      </div>
    </div>
  );
}
