import React, { useState } from 'react';
import { useCaseTypes } from '../api/useCaseTypes';
import { CaseType } from '../types';
import { AppError } from '@/lib/error-handling';
import { PlusCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectSeparator,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AddCaseTypeModal } from './AddCaseTypeModal';

/**
 * Props for the CaseTypeSelector component
 */
interface CaseTypeSelectorProps {
  /**
   * Current selected case type ID
   */
  value?: string;
  
  /**
   * Called when a case type is selected
   */
  onValueChange: (value: string, caseType?: CaseType) => void;
  
  /**
   * Whether the selector is disabled
   */
  disabled?: boolean;
  
  /**
   * Whether the field is required
   */
  required?: boolean;
  
  /**
   * Custom CSS class for the trigger element
   */
  className?: string;
  
  /**
   * Custom placeholder text when nothing is selected
   * @default "Select case type"
   */
  placeholder?: string;
  
  /**
   * Custom error message when case types can't be loaded
   */
  errorMessage?: string;
  
  /**
   * Function to render each case type item
   * @default Renders the case type name
   */
  renderItem?: (caseType: CaseType) => React.ReactNode;
  
  /**
   * Whether to show an option to add a new case type
   * @default true
   */
  showAddOption?: boolean;
  
  /**
   * Custom text for the "Add new" option
   * @default "Add new case type"
   */
  addNewText?: string;
}

/**
 * A reusable component for selecting case types from the database
 * with the ability to add new case types
 */
export function CaseTypeSelector({
  value,
  onValueChange,
  disabled = false,
  required = false,
  className = '',
  placeholder = "Select case type",
  errorMessage,
  renderItem,
  showAddOption = true,
  addNewText = "Add new case type"
}: CaseTypeSelectorProps) {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const { 
    data: caseTypes = [], 
    isLoading, 
    error 
  } = useCaseTypes();

  // Handler for selection changes
  const handleValueChange = (newValue: string) => {
    if (newValue === 'add-new') {
      setIsAddModalOpen(true);
      return;
    }
    
    const selectedCaseType = caseTypes.find(ct => ct.id === newValue);
    onValueChange(newValue, selectedCaseType);
  };
  
  // Handle successful case type creation
  const handleCaseTypeCreated = (newCaseTypeId: string) => {
    onValueChange(newCaseTypeId);
  };

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled || isLoading}
        required={required}
      >
        <SelectTrigger className={cn("w-full", className)}>
          <SelectValue 
            placeholder={isLoading ? "Loading case types..." : placeholder} 
          />
        </SelectTrigger>
        <SelectContent>
          {isLoading ? (
            <SelectItem value="loading" disabled>
              <div className="flex items-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-t-transparent border-primary rounded-full animate-spin" />
                <span>Loading case types...</span>
              </div>
            </SelectItem>
          ) : caseTypes.length > 0 ? (
            caseTypes.map(caseType => (
              <SelectItem key={caseType.id} value={caseType.id}>
                {renderItem ? renderItem(caseType) : caseType.name}
              </SelectItem>
            ))
          ) : (
            <SelectItem value="none" disabled>No case types available</SelectItem>
          )}
          
          {/* Add new case type option */}
          {showAddOption && (
            <>
              {caseTypes.length > 0 && <SelectSeparator />}
              <SelectItem value="add-new" className="text-primary focus:text-primary">
                <div className="flex items-center gap-2">
                  <PlusCircle className="h-4 w-4" />
                  <span>{addNewText}</span>
                </div>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      
      {error && (
        <p className="text-sm text-red-500">
          {errorMessage || (error instanceof AppError ? error.message : 'Error loading case types')}
        </p>
      )}
      
      {!isLoading && caseTypes.length === 0 && !error && !isAddModalOpen && (
        <p className="text-xs text-amber-600">
          No case types found. {showAddOption ? 'Use the dropdown to add a new case type.' : 'Please contact your administrator to set up case types.'}
        </p>
      )}
      
      {/* Modal for adding a new case type */}
      <AddCaseTypeModal 
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={handleCaseTypeCreated}
      />
    </div>
  );
}