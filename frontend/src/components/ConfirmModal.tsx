import { AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

const ConfirmModal = ({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
  children,
}: ConfirmModalProps) => {
  const variantStyles = {
    danger: { bg: 'bg-coral', text: 'text-white', icon: 'text-coral' },
    warning: { bg: 'bg-gold', text: 'text-structural', icon: 'text-gold' },
    default: { bg: 'bg-cobalt', text: 'text-white', icon: 'text-cobalt' },
  };

  const style = variantStyles[variant];

  return (
    <div className="confirm-modal-overlay" onClick={onCancel}>
      <div
        className="confirm-modal clay-card bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal-header">
          <div className={`confirm-modal-icon clay-circle ${style.bg}`}>
            <AlertTriangle size={20} className="text-white" />
          </div>
          <h3 className="font-syne text-xl font-bold text-structural">{title}</h3>
        </div>

        <p className="text-on-surface-variant font-jakarta text-sm leading-relaxed mt-3 mb-4">
          {message}
        </p>

        {children}

        <div className="confirm-modal-actions">
          <button
            onClick={onCancel}
            className="clay-btn bg-white text-structural px-6 py-2.5 text-sm"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`clay-btn ${style.bg} ${style.text} px-6 py-2.5 text-sm`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
