import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface LegalNoticeModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export const LegalNoticeModal: React.FC<LegalNoticeModalProps> = ({ isOpen, onAccept }) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B0F1A]/90 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="legal-notice-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100 max-h-[90vh] flex flex-col safe-top safe-bottom"
          >
            <div className="bg-[#0B0F1A] p-5 sm:p-8 text-white flex items-center gap-4 sm:gap-6 shrink-0">
              <div className="p-3 sm:p-4 bg-[#C5A059] rounded-xl sm:rounded-2xl text-[#0B0F1A] shadow-xl shadow-[#C5A059]/10 shrink-0">
                <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h2 id="legal-notice-title" className="text-2xl sm:text-3xl font-display font-bold tracking-tight">Professional Standards Notice</h2>
                <p className="text-[#C5A059] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mt-1">Statum Legal</p>
              </div>
            </div>

            <div className="p-6 sm:p-10 space-y-6 sm:space-y-8 flex-1 overflow-y-auto custom-scrollbar">
              <div className="flex gap-4 sm:gap-5 items-start p-4 sm:p-6 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100">
                <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-[#C5A059] shrink-0 mt-1" />
                <div className="text-xs sm:text-sm text-[#0B0F1A] leading-relaxed">
                  <p className="font-display font-bold text-[#0B0F1A] mb-1 sm:mb-2 text-sm sm:text-base">Statutory Intelligence Protocol</p>
                  <p className="font-medium opacity-90">This system operates on a high-precision legal intelligence engine designed to provide expert-level guidance on the Laws of Uganda.</p>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6 text-[#0B0F1A]/80">
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">1</div>
                  <p className="text-xs sm:text-sm leading-relaxed font-medium">Statum Legal analyzes the Constitution and Statutes of Uganda. Every output is anchored to actual statutory materials for maximum reliability.</p>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">2</div>
                  <p className="text-xs sm:text-sm leading-relaxed font-medium">As with any high-level legal strategy, users may verify specific procedural details with advocates registered with the Uganda Law Society.</p>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">3</div>
                  <p className="text-xs sm:text-sm leading-relaxed font-medium">Document generation provides professional-grade drafts based on statutory standards and current Ugandan legal scholarship.</p>
                </div>
              </div>

              <div className="p-4 sm:p-6 bg-slate-50/50 rounded-xl sm:rounded-2xl border border-slate-100 text-[10px] sm:text-[11px] text-slate-500 italic leading-relaxed">
                By clicking "Enter", you acknowledge the professional nature of this platform and its role in providing intelligent legal guidance.
              </div>
            </div>

            <div className="p-5 sm:p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end shrink-0">
              <button
                onClick={onAccept}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#0B0F1A] hover:bg-black text-[#C5A059] px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold transition-all shadow-2xl shadow-black/10 active:scale-[0.98] text-sm sm:text-base"
              >
                <CheckCircle2 className="w-5 h-5" />
                Enter Statum Legal
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
