import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Field, FieldLabel } from '@/components/ui/field';
import { samples } from '../shared/sample-data';
import './styles.css';

function Comparison() {
  const [example, setExample] = useState('setup');
  const query = new URLSearchParams(['empty', 'loading'].includes(example) ? { scenario: example } : { capture: example }).toString();
  const variants = [
    { name: 'Signal shelf', skill: 'Impeccable', description: 'Three-pane workspace · mineral blue + lime', url: `http://127.0.0.1:5178/?${query}` },
    { name: 'Quiet ledger', skill: 'ui-ux-pro-max', description: 'Top navigation · charcoal, teal + warm orange', url: `/?${query}` },
  ];
  return <><header className="compare-header"><div><h1>Two directions. The same captures.</h1><p>Identical synthetic content and state. Each pane adapts to its actual width; open a design separately for a full desktop view.</p></div><Field orientation="horizontal"><FieldLabel htmlFor="compare-example">Compare state</FieldLabel><select id="compare-example" value={example} onChange={event => setExample(event.target.value)}>{samples.map(sample => <option key={sample.id} value={sample.id}>{sample.id === 'setup' ? 'Setup required' : sample.id === 'retention' ? 'Local retention failed' : sample.id === 'legacy' ? 'Legacy staged' : sample.id === 'active' ? 'Acquiring' : sample.id === 'partial' ? 'Partial capture' : sample.locus.text}</option>)}<option value="empty">Empty library</option><option value="loading">Loading library</option></select></Field></header><main className="compare-grid">{variants.map(variant => <section className="compare-pane" key={variant.name}><header><div><h2>{variant.name}</h2><p>{variant.skill} · {variant.description}</p></div><a href={variant.url} target="_blank" rel="noreferrer">Open separately</a></header><iframe key={variant.url} src={variant.url} title={`${variant.name} interactive sample`} /></section>)}</main></>;
}
createRoot(document.getElementById('root')!).render(<Comparison />);
