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
                className="panel-input w-full rounded-xl px-3 py-2 text-sm"
            />
            {isOpen && filteredOptions.length > 0 && (
                <ul className="panel-gradient-subtle absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-widget-border shadow-lg">
                    {filteredOptions.map((option) => (
                        <li
                            key={option}
                            // onMouseDown fires before onBlur
                            onMouseDown={() => handleSelectOption(option)}
                            className="cursor-pointer px-3 py-2 text-sm text-text hover:bg-panel/70"
                        >
                            {option}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
