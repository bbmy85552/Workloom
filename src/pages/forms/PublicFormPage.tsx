import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, asApiError } from '../../lib/api';
import type { PublicFormDetail } from '../../lib/types';
import { DEFAULT_PUBLIC_SETTINGS, fetchPublicSettings } from '../../lib/publicSettings';

interface ChoiceOption {
  label: string;
  value: string;
}

function normalizeChoices(choices: unknown): ChoiceOption[] {
  if (!Array.isArray(choices)) return [];
  return choices
    .map((choice) => {
      if (typeof choice === 'string') return { label: choice, value: choice };
      if (choice && typeof choice === 'object') {
        const item = choice as { label?: unknown; value?: unknown };
        const value = item.value == null ? '' : String(item.value);
        const label = item.label == null ? value : String(item.label);
        if (!value && !label) return null;
        return { label: label || value, value: value || label };
      }
      return null;
    })
    .filter((choice): choice is ChoiceOption => !!choice);
}

export function PublicFormPage() {
  const { token } = useParams<{ token: string }>();
  const [form, setForm] = useState<PublicFormDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [brandName, setBrandName] = useState(DEFAULT_PUBLIC_SETTINGS.brandName);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const [formRes, settings] = await Promise.all([
          api.get<{ form: PublicFormDetail }>(`/public/forms/${token}`),
          fetchPublicSettings().catch(() => DEFAULT_PUBLIC_SETTINGS),
        ]);
        const { data } = formRes;
        setForm(data.form);
        setBrandName(settings.brandName);
      } catch (err) {
        setError(asApiError(err).error);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const submit = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/public/forms/${token}/submit`, { data: values });
      setDone(true);
    } catch (err) {
      setError(asApiError(err).error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-start justify-center py-10 px-4">
      <div className="w-full max-w-xl">
        <div className="text-center mb-6">
          <div className="text-2xl font-serif font-bold text-text-primary">{brandName} · 公开表单</div>
          <div className="text-xs text-text-secondary mt-1">由表单创建者邀请你填写</div>
        </div>

        <div className="glass-card rounded-3xl p-6 sm:p-8 shadow-xl">
          {loading && <div className="text-sm text-text-secondary text-center">加载中…</div>}
          {!loading && error && !form && (
            <div className="text-sm text-red-600 text-center">{error}</div>
          )}
          {!loading && done && (
            <div className="text-center py-6">
              <div className="text-base font-medium text-text-primary mb-2">提交成功，感谢你的反馈！</div>
              <button
                onClick={() => {
                  setDone(false);
                  setValues({});
                }}
                className="mt-2 text-sm text-liquid-indigo hover:underline"
              >
                再提交一份
              </button>
            </div>
          )}
          {!loading && form && !done && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-bold text-text-primary mb-1">{form.title}</h1>
                {form.description && (
                  <p className="text-sm text-text-secondary whitespace-pre-wrap">
                    {form.description}
                  </p>
                )}
              </div>

              {form.fields.map((field) => (
                <label key={field.name} className="block">
                  <span className="text-sm text-text-primary mb-1.5 block">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </span>
                  <FormInput
                    field={field}
                    value={values[field.name]}
                    onChange={(v) => setValues({ ...values, [field.name]: v })}
                  />
                </label>
              ))}

              {error && <div className="text-sm text-red-600">{error}</div>}

              <button
                onClick={submit}
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-liquid-indigo text-white text-sm font-medium hover:bg-primary disabled:opacity-60"
              >
                {submitting ? '提交中…' : '提交'}
              </button>
            </div>
          )}
        </div>

        <div className="text-center text-xs text-text-secondary mt-4">
          表单数据将存入对应的数据表，仅创建者可查看。
        </div>
      </div>
    </div>
  );
}

function FormInput({
  field,
  value,
  onChange,
}: {
  field: PublicFormDetail['fields'][number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const base = 'w-full px-3 py-2 rounded-xl border border-black/10 bg-white text-sm outline-none focus:border-liquid-indigo';
  if (field.type === 'longtext') {
    return (
      <textarea
        rows={4}
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      />
    );
  }
  if (field.type === 'number' || field.type === 'rating' || field.type === 'progress') {
    return (
      <input
        type="number"
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        className={base}
      />
    );
  }
  if (field.type === 'date' || field.type === 'datetime') {
    return (
      <input
        type={field.type === 'datetime' ? 'datetime-local' : 'date'}
        value={(value as string) || ''}
        onChange={(e) => onChange(e.target.value)}
        className={base}
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <input
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  }
  if (field.type === 'select' || field.type === 'multiselect') {
    const opts = normalizeChoices(field.options.choices);
    if (opts.length === 0) {
      return (
        <input
          type="text"
          value={(value as string) || ''}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      );
    }
    if (field.type === 'multiselect') {
      const cur = (value as string[]) || [];
      return (
        <div className="flex flex-wrap gap-2">
          {opts.map((o) => {
            const sel = cur.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                onClick={() =>
                  onChange(sel ? cur.filter((x) => x !== o.value) : [...cur, o.value])
                }
                className={`px-3 py-1.5 rounded-full text-xs border ${
                  sel ? 'bg-liquid-indigo text-white border-liquid-indigo' : 'border-black/10 text-text-secondary'
                }`}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    return (
      <select value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} className={base}>
        <option value="">请选择</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <input
      type={field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
      value={(value as string) || ''}
      onChange={(e) => onChange(e.target.value)}
      className={base}
    />
  );
}
