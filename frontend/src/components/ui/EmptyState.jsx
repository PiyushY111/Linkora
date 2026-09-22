const EmptyState = ({ icon: Icon, title, description, action }) => (
  <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
    {Icon && (
      <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-ink-800 ring-1 ring-ink-600">
        <Icon size={22} className="text-paper-500" />
      </div>
    )}
    <h3 className="text-base font-semibold text-paper-100">{title}</h3>
    {description && <p className="max-w-sm text-sm text-paper-500">{description}</p>}
    {action && <div className="mt-3">{action}</div>}
  </div>
);

export default EmptyState;
