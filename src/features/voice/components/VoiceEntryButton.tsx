import { Link } from 'react-router-dom';

type VoiceEntryButtonProps = {
  label?: string;
};

export function VoiceEntryButton({ label = 'Record voice note' }: VoiceEntryButtonProps) {
  return (
    <Link className="button button-primary" to="/voice/new">
      {label}
    </Link>
  );
}
