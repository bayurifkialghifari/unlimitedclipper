import { Select } from '@unlimitedclipper/ui';
import { useText } from '../lib/i18n';

export function ContentProfileSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const text = useText();
  return (
    <Select label={text.contentProfile} value={value} onChange={onChange}>
      <option value="podcast">{text.profilePodcast}</option>
      <option value="gaming">{text.profileGaming}</option>
      <option value="motivation">{text.profileMotivation}</option>
      <option value="education">{text.profileEducation}</option>
      <option value="general">{text.profileGeneral}</option>
    </Select>
  );
}
