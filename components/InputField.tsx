import React from 'react';

interface InputFieldProps {
  label: string;
  id: string;
  type: React.HTMLInputTypeAttribute;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  min?: string;
}

const InputField: React.FC<InputFieldProps> = ({
  label,
  id,
  type,
  value,
  onChange,
  placeholder,
  required = false,
  min,
}) => {
  return (
    <div className="mb-1">
      <label htmlFor={id} className="block text-[10px] uppercase tracking-widest text-gray-400 font-bold mb-1.5 px-1">
        {label} {required && <span className="text-blue-400">*</span>}
      </label>
      <input
        type={type}
        id={id}
        name={id}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        min={min}
        className="w-full bg-black/20 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 transition-all"
      />
    </div>
  );
};

export default InputField;