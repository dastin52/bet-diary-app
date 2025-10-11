import React, { SelectHTMLAttributes } from 'react';

const Select: React.FC<SelectHTMLAttributes<HTMLSelectElement>> = ({ children, ...props }) => {
  return (
    <select
      {...props}
      className="block w-full pl-3 pr-10 py-2 text-base bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md text-gray-900 dark:text-white"
    >
      {children}
    </select>
  );
};

export default Select;