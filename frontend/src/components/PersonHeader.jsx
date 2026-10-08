import Avatar from './Avatar.jsx';
import './PersonHeader.css';

/** The person at the top of "My account": a big avatar, the name, the role. */
export default function PersonHeader({ name, role, detail }) {
  return (
    <section className="person">
      <Avatar name={name} size={72} className="person__avatar" />
      <div className="person__text">
        <h2 className="person__name">{name}</h2>
        <p className="person__meta">
          <span className="tag tag--green">{role}</span>
          {detail && <span className="person__detail">{detail}</span>}
        </p>
      </div>
    </section>
  );
}