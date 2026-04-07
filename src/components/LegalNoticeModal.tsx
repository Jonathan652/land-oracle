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
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200"
          >
            <div className="bg-amber-700 p-6 text-white flex items-center gap-4">
              <div className="p-3 bg-white/20 rounded-xl">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Professional Legal Notice</h2>
                <p className="text-amber-100 text-sm">Uganda Law Portal</p>
              </div>
            </div>

            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              <div className="flex gap-4 items-start p-4 bg-amber-50 rounded-xl border border-amber-100">
                <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-1" />
                <div className="text-sm text-amber-900">
                  <p className="font-semibold mb-1">Important Disclaimer</p>
                  <p>The information provided by this system is for informational and educational purposes only. It does not constitute legal advice, and no attorney-client relationship is formed.</p>
                </div>
              </div>

              <div className="space-y-4 text-slate-700">
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-bold">1</div>
                  <p className="text-sm">This system uses artificial intelligence to analyze the Laws of Uganda. While we strive for 100% accuracy, legal interpretations can vary.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-bold">2</div>
                  <p className="text-sm">Users are strongly advised to consult with a qualified advocate registered with the Uganda Law Society for specific legal matters.</p>
                </div>
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-xs font-bold">3</div>
                  <p className="text-sm">The system's outputs, including generated documents, are drafts and should be reviewed by legal counsel before use in official proceedings.</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-500 italic">
                By clicking "I Accept and Understand," you acknowledge that you have read this notice and agree that the system is a guidance tool, not a replacement for professional legal services.
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={onAccept}
                className="flex items-center gap-2 bg-amber-700 hover:bg-amber-800 text-white px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-amber-900/20 active:scale-95"
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
