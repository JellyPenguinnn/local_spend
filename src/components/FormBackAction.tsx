import { ArrowLeft } from "lucide-react";

interface FormBackActionProps {
  onClick: () => void;
}

export function FormBackAction({ onClick }: FormBackActionProps) {
  return (
    <button className="form-back-action" type="button" onClick={onClick} aria-label="Back">
      <ArrowLeft size={16} />
      <span>Back</span>
    </button>
  );
}
