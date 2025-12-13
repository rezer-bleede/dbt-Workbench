import React, { useState, useEffect, useRef } from 'react';

interface AutocompleteProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    strict?: boolean;
    className?: string;
}

export const Autocomplete: React.FC<AutocompleteProps> = ({
    options,
    value,
    onChange,
    placeholder,
    strict = false,
    className = '',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState(value);
    const [filteredOptions, setFilteredOptions] = useState<string[]>([]);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setSearchTerm(value);
    }, [value]);

    useEffect(() => {
        const filtered = options.filter((option) =>
            option.toLowerCase().includes(searchTerm.toLowerCase())
        );
        setFilteredOptions(filtered);
    }, [searchTerm, options]);

    const handleBlur = () => {
        // Delay to allow selection events to fire if needed
        // But with onMouseDown + preventDefault on options, this might not be strictly necessary
        // However, a small timeout is safer if we don't preventDefault everywhere
        setTimeout(() => {
            setIsOpen(false);
            if (strict && searchTerm && !options.includes(searchTerm)) {
                onChange('');
                setSearchTerm('');
            }
        }, 150);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setSearchTerm(newVal);
        setIsOpen(true);
        onChange(newVal);
    };

    const handleSelectOption = (option: string) => {
        setSearchTerm(option);
        onChange(option);
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className={`relative ${className}`}>
            <input
                type="text"
                value={searchTerm}
                onChange={handleInputChange}
                onFocus={() => setIsOpen(true)}
                onBlur={handleBlur}
                placeholder={placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {isOpen && filteredOptions.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto">
                    {filteredOptions.map((option) => (
                        <li
                            key={option}
                            // onMouseDown fires before onBlur
                            onMouseDown={() => handleSelectOption(option)}
                            className="px-3 py-2 cursor-pointer hover:bg-gray-100 text-sm text-gray-700"
                        >
                            {option}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
