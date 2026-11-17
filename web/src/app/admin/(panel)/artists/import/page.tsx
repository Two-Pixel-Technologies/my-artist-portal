'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { adminApi, ApiError, request } from '@/lib/client';
import { useAdmin } from '@/components/admin/ui';

export default function ImportPage() {
  const { toast } = useAdmin();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [onDup, setOnDup] = useState<'skip' | 'update'>('skip');
  const [fileName, setFileName] = useState('');

  async function pick(file: File) {
    setBusy(true); setError(''); setPreview(null); setResult(null); setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append('file', file);
      setPreview(await request('POST', '/api/admin/artists/import/preview', fd));
    } catch (e: any) { setError(e instanceof ApiError ? e.message : 'Upload failed'); }
    finally { setBusy(false); }
  }

  async function commit() {
    setBusy(true);
    try { setResult(await adminApi.post(`/artists/import/${preview.batchId}/commit`, { onDuplicate: onDup })); setPreview(null); toast('Import finished'); }
    catch (e: any) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div className="adm-title"><h1>Import artists from Excel</h1><Link className="btn btn--outline btn--sm" href="/admin/artists">Back to artists</Link></div>

      <section className="panel">
        <h2>1. Get the template</h2>
        <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>It has every field, tips on each column, and a Lookups sheet with the exact category and city names. Phone number is the unique key.</p>
        <a className="btn btn--outline btn--sm" href="/api/admin/artists/template.xlsx">Download template (.xlsx)</a>
      </section>

      <section className="panel">
        <h2>2. Upload your file</h2>
        <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pick(f); e.target.value = ''; }} />
        <button className="btn btn--primary btn--sm" onClick={() => fileRef.current?.click()} disabled={busy}>{busy && !preview ? 'Checking…' : 'Choose .xlsx file'}</button>
        {fileName && <span className="muted" style={{ marginLeft: 12, fontSize: 14 }}>{fileName}</span>}
        <p className="form-note" style={{ marginTop: 10 }}>Nothing is saved yet. You will see a preview first.</p>
        {error && <p className="form-error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
      </section>

      {preview && (
        <section className="panel">
          <h2>3. Review &amp; import</h2>
          <div className="stat-grid" style={{ marginBottom: 14 }}>
            <div className="stat"><b style={{ color: 'var(--green)' }}>{preview.summary.valid}</b><span>Ready to import</span></div>
            <div className={`stat${preview.summary.errors ? ' is-hot' : ''}`}><b>{preview.summary.errors}</b><span>Rows with problems (skipped)</span></div>
            <div className="stat"><b>{preview.summary.duplicates}</b><span>Already exist (same phone)</span></div>
          </div>
          {preview.summary.newCities.length > 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>New cities that will be created: {preview.summary.newCities.join('; ')}</p>}
          {preview.unknownHeaders?.length > 0 && <p className="muted" style={{ fontSize: 14, marginBottom: 12 }}>Ignored columns: {preview.unknownHeaders.join(', ')}</p>}

          {preview.errors.length > 0 && (
            <div className="tbl-wrap" style={{ marginBottom: 16 }}>
              <table className="tbl"><thead><tr><th>Row</th><th>Name</th><th>Problems to fix in Excel</th></tr></thead>
                <tbody>{preview.errors.map((e: any) => <tr key={e.row}><td>{e.row}</td><td>{e.name}</td><td style={{ color: 'var(--red)' }}>{e.problems.join(' · ')}</td></tr>)}</tbody></table>
            </div>
          )}

          {preview.summary.duplicates > 0 && (
            <div className="field" style={{ maxWidth: 420, marginBottom: 14 }}>
              <label>When a phone number already exists</label>
              <select className="select" value={onDup} onChange={(e) => setOnDup(e.target.value as any)}>
                <option value="skip">Skip it (keep the current profile)</option>
                <option value="update">Update it with the spreadsheet values</option>
              </select>
              {onDup === 'update' && <span className="hint">Updating replaces all profile fields with the sheet&apos;s values. Photos are kept.</span>}
            </div>
          )}

          <div className="tbl-wrap" style={{ marginBottom: 16 }}>
            <table className="tbl"><thead><tr><th>Row</th><th>Name</th><th>Phone</th><th>City</th><th>Headline</th><th>Note</th></tr></thead>
              <tbody>{preview.preview.map((r: any) => <tr key={r.row}><td>{r.row}</td><td>{r.fullName}</td><td>{r.phone}</td><td>{r.city}</td><td>{r.headline || <span className="muted">—</span>}</td><td>{r.duplicateOf ? <span className="pill pill--pending">Exists: {r.duplicateOf}</span> : <span className="pill pill--active">New</span>}</td></tr>)}</tbody></table>
          </div>
          {preview.summary.valid > preview.preview.length && <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>Showing the first {preview.preview.length} of {preview.summary.valid} rows.</p>}

          <button className="btn btn--primary" onClick={commit} disabled={busy || preview.summary.valid === 0}>{busy ? 'Importing…' : `Import ${preview.summary.valid} artist${preview.summary.valid === 1 ? '' : 's'}`}</button>
        </section>
      )}

      {result && (
        <section className="panel">
          <h2>Import complete</h2>
          <p>Created <strong>{result.created}</strong>, updated <strong>{result.updated}</strong>, skipped <strong>{result.skipped}</strong>{result.failed.length ? <>, failed <strong style={{ color: 'var(--red)' }}>{result.failed.length}</strong></> : null}.</p>
          {result.failed.length > 0 && <ul style={{ margin: '10px 0', color: 'var(--red)', fontSize: 14 }}>{result.failed.map((f: any) => <li key={f.row}>Row {f.row} ({f.name}): {f.error}</li>)}</ul>}
          <p className="muted" style={{ marginTop: 10, fontSize: 14 }}>Imported artists are Active unless the Status column said otherwise. Next, open each artist to upload a photo.</p>
          <div style={{ marginTop: 14 }}><Link className="btn btn--primary btn--sm" href="/admin/artists">View artists</Link></div>
        </section>
      )}
    </>
  );
}
