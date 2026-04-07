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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0B0F1A]/90 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-3xl sm:rounded-[2.5rem] shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-100"
          >
            <div className="bg-[#0B0F1A] p-6 sm:p-8 text-white flex items-center gap-4 sm:gap-6">
              <div className="p-3 sm:p-4 bg-[#C5A059] rounded-xl sm:rounded-2xl text-[#0B0F1A] shadow-xl shadow-[#C5A059]/10 shrink-0">
                <ShieldCheck className="w-6 h-6 sm:w-8 sm:h-8" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight">Professional Legal Notice</h2>
                <p className="text-[#C5A059] text-[10px] sm:text-xs font-bold uppercase tracking-[0.2em] mt-1">Uganda Law Portal</p>
              </div>
            </div>

            <div className="p-6 sm:p-10 space-y-6 sm:space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="flex gap-4 sm:gap-5 items-start p-4 sm:p-6 bg-slate-50 rounded-xl sm:rounded-2xl border border-slate-100">
                <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-[#C5A059] shrink-0 mt-1" />
                <div className="text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <p className="font-display font-bold text-[#0B0F1A] mb-1 sm:mb-2 text-sm sm:text-base">Important Disclaimer</p>
                  <p>The information provided by this system is for informational and educational purposes only. It does not constitute legal advice, and no attorney-client relationship is formed.</p>
                </div>
              </div>

              <div className="space-y-4 sm:space-y-6 text-slate-600">
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">1</div>
                  <p className="text-xs sm:text-sm leading-relaxed">This system uses artificial intelligence to analyze the Laws of Uganda. While we strive for 100% accuracy, legal interpretations can vary.</p>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">2</div>
                  <p className="text-xs sm:text-sm leading-relaxed">Users are strongly advised to consult with a qualified advocate registered with the Uganda Law Society for specific legal matters.</p>
                </div>
                <div className="flex gap-3 sm:gap-4">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 text-[10px] sm:text-xs font-bold text-[#0B0F1A]">3</div>
                  <p className="text-xs sm:text-sm leading-relaxed">The system's outputs, including generated documents, are drafts and should be reviewed by legal counsel before use in official proceedings.</p>
                </div>
              </div>

              <div className="p-4 sm:p-6 bg-slate-50/50 rounded-xl sm:rounded-2xl border border-slate-100 text-[10px] sm:text-[11px] text-slate-400 italic leading-relaxed">
                By clicking "I Accept and Understand," you acknowledge that you have read this notice and agree that the system is a guidance tool, not a replacement for professional legal services.
              </div>
            </div>

            <div className="p-6 sm:p-8 bg-slate-50/50 border-t border-slate-100 flex justify-end">
              <button
                onClick={onAccept}
                className="w-full sm:w-auto flex items-center justify-center gap-3 bg-[#0B0F1A] hover:bg-black text-[#C5A059] px-6 sm:px-10 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl font-bold transition-all shadow-2xl shadow-black/10 active:scale-[0.98] text-sm sm:text-base"
              >
                <CheckCircle2 className="w-5 h-5" />
                I Accept and Understand
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
