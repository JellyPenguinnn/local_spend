import { ArrowLeft } from "lucide-react";

interface FormBackActionProps {
  label: string;
  onClick: () => void;
}

export function FormBackAction({ label, onClick }: FormBackActionProps) {
  return (
    <button className="form-back-action" type="button" onClick={onClick}>
      <ArrowLeft size={16} />
      <span>{label}</span>
    </button>
  );
}
