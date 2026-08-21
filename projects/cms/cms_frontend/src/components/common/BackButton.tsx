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
        backgroundColor: '#27272a',
        border: '1px solid #3f3f46',
        color: '#f1f5f9',
        borderRadius: '8px',
        fontWeight: '500',
        cursor: 'pointer',
        transition: 'all 0.2s',
        marginBottom: '24px'
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = '#ec4899';
        e.currentTarget.style.backgroundColor = '#3f3f46';
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = '#3f3f46';
        e.currentTarget.style.backgroundColor = '#27272a';
      }}
    >
      <ArrowLeft size={18} />
      Back
    </button>
  );
}