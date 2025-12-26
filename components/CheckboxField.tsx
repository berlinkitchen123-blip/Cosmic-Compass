import React from 'react';

interface CheckboxFieldProps {
  label: string;
  id: string;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

const CheckboxField: React.FC<CheckboxFieldProps> = ({ label, id, checked, onChange }) => {
  return (
    <label className="flex items-center p-2.5 rounded-xl border border-white/5 hover:bg-white/5 transition-all cursor-pointer">
      <div className="relative flex items-center">
        <input
          type="checkbox"
          id={id}
          name={id}
          checked={checked}
          onChange={onChange}
          className="peer appearance-none h-4 w-4 bg-black/20 border border-white/20 rounded focus:ring-0 focus:ring-offset-0 transition-all"
        />
        <svg
          className="absolute w-4 h-4 text-blue-500 hidden peer-checked:block pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth="4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <span className={`ml-3 text-xs transition-all ${checked ? 'text-white font-semibold' : 'text-gray-400'}`}>
        {label}
      </span>
    </label>
  );
};

export default CheckboxField;