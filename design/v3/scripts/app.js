const ROUTES = [
  ['/', 'HomePage'],
  ['/guide', 'GuidePage'],
  ['/projects', 'ProjectsPage'],
  ['/projects/:id', 'ProjectPage'],
  ['/projects/:id/:tab', 'ProjectPage'],
  ['/workflows/:id', 'WorkflowPage'],
  ['/issues', 'IssuesPage'],
  ['/issues/:id', 'IssuePage'],
  ['/records', 'RecordsPage'],
  ['/records/:key', 'RecordPage'],
  ['/connections', 'ConnectionsPage'],
  ['/connections/:id', 'ConnectionPage'],
  ['/connectors', 'ConnectorsPage'],
  ['/new', 'WizardPage'],
];

function NotFoundPage() {
  return html`<div className="page-inner"><${Empty} icon="MapPinOff" title="这个页面不存在" action=${html`<${Button} onClick=${() => navigate('/')}>回到首页<//>`} /></div>`;
}

function App() {
  const route = useRoute();
  const matched = ROUTES.map(([pattern, name]) => ({ name, params: matchRoute(pattern, route.path) })).find((r) => r.params);
  const Page = (matched && window[matched.name]) || NotFoundPage;
  return html`<${Shell} routeKey=${route.path}>
    <${Page} params=${matched ? matched.params : {}} query=${route.query} />
  <//>`;
}

Store.init(seedState);
ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`);
