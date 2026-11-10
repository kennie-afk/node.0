import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton() {
  const navigate = useNavigate();

  return (
    <button type="button" className="ui-btn is-secondary is-sm" onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>
      <ArrowLeft size={14} aria-hidden />
      Back
    </button>
  );
}
