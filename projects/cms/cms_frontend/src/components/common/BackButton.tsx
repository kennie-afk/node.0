import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function BackButton() {
  const navigate = useNavigate();

  return (
    <button 
      onClick={() => navigate(-1)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '10px 18px',
        backgroundColor: 'var(--c-fill)',
        border: '1px solid var(--c-border-strong)',
        color: 'var(--c-text)',
        borderRadius: '6px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '24px'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = 'var(--c-accent)';
        e.currentTarget.style.backgroundColor = 'var(--c-fill-strong)';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = 'var(--c-fill-strong)';
        e.currentTarget.style.backgroundColor = 'var(--c-fill)';
      }}
    >
      <ArrowLeft size={18} />
      Back
    </button>
  );
}