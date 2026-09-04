import type { TeacherLetterGroup, TeacherScope } from "../directory";

interface Props {
  groups: TeacherLetterGroup[];
  selectedId: string | null;
  scope: TeacherScope;
  onScopeChange: (scope: TeacherScope) => void;
  onSelect: (memberId: string, trigger: HTMLButtonElement) => void;
}

const scopes: Array<{ value: TeacherScope; label: string }> = [
  { value: "all", label: "Tutti" },
  { value: "middle", label: "Docenti medie" },
  { value: "upper", label: "Docenti superiori" },
  { value: "mine", label: "I miei gruppi" },
];

function teacherInitials(name: string | null, email: string): string {
  const words = name?.trim().split(/\s+/u).filter(Boolean) ?? [];
  const source = words.length > 0 ? words : [email.split("@")[0]];
  return [source[0], source.length > 1 ? source[source.length - 1] : ""]
    .map((word) => word.charAt(0))
    .join("")
    .toLocaleUpperCase("it");
}

function letterTarget(letter: string): string {
  return `teacher-letter-${letter === "#" ? "other" : letter}`;
}

export default function TeacherDirectory({ groups, selectedId, scope, onScopeChange, onSelect }: Props) {
  return (
    <div className="teacher-directory">
      <div className="teacher-directory__scopes" role="group" aria-label="Filtra docenti">
        {scopes.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className="teacher-directory__scope"
            aria-pressed={scope === value}
            onClick={() => onScopeChange(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="surface-card field-hint directory-empty">
          Nessun docente corrisponde alla ricerca e ai filtri.
        </p>
      ) : (
        <div className="teacher-directory__body">
          <div className="teacher-directory__groups">
            {groups.map(({ letter, members }) => (
              <section key={letter} className="teacher-letter-group" aria-labelledby={letterTarget(letter)}>
                <h3 id={letterTarget(letter)} className="teacher-letter-group__heading">{letter}</h3>
                <div className="teacher-letter-group__rows">
                  {members.map((member) => {
                    const label = member.name?.trim() || member.email;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        className="teacher-contact-row"
                        aria-label={`Mostra dettagli di ${label}`}
                        aria-pressed={selectedId === member.id}
                        onClick={(event) => onSelect(member.id, event.currentTarget)}
                      >
                        <span className="teacher-contact-row__initials" aria-hidden="true">
                          {teacherInitials(member.name, member.email)}
                        </span>
                        <span className="teacher-contact-row__text">
                          <span className="teacher-contact-row__name">{label}</span>
                          <span className="teacher-contact-row__secondary">{member.email}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <nav className="teacher-alphabet" aria-label="Indice alfabetico">
            {groups.map(({ letter }) => (
              <a key={letter} href={`#${letterTarget(letter)}`}>{letter}</a>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
