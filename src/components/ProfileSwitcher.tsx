import { ChevronDown, Plus, UserRound } from "lucide-react";
import type { ProfileMeta, ProfilesState } from "../lib/types";

interface ProfileSwitcherProps {
  state: ProfilesState;
  activeProfile: ProfileMeta | null;
  onSwitch: (profileId: string) => void;
  onCreateQuick: () => void;
}

export function ProfileSwitcher({ state, activeProfile, onSwitch, onCreateQuick }: ProfileSwitcherProps) {
  return (
    <div className="profile-switcher">
      <div className="profile-pill" title="Active profile">
        <span className="profile-dot" style={{ background: activeProfile?.color ?? "#778" }} />
        <UserRound size={16} />
        <select value={activeProfile?.id ?? ""} onChange={(event) => onSwitch(event.target.value)} aria-label="Switch active profile">
          {state.profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.displayName}
            </option>
          ))}
        </select>
        <ChevronDown size={14} aria-hidden="true" />
      </div>
      <button className="icon-button" type="button" onClick={onCreateQuick} aria-label="Create profile" title="Create profile">
        <Plus size={16} />
      </button>
    </div>
  );
}
