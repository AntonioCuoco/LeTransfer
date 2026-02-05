import { useState, useCallback, useRef } from 'react';

interface UseFileDragAndDropOptions {
    onFilesDropped: (files: File[]) => void;
    accept?: string; // Tipi di file accettati (es. "image/*", ".pdf")
    multiple?: boolean;
    disabled?: boolean;
}

interface UseFileDragAndDropReturn {
    isDragOver: boolean;
    dragProps: {
        onDragEnter: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDragOver: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
    };
    dropZoneRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook per gestire il drag & drop di file singoli/multipli.
 * Funziona su tutti i browser senza controlli speciali.
 */
export const useFileDragAndDrop = ({
    onFilesDropped,
    accept,
    multiple = true,
    disabled = false
}: UseFileDragAndDropOptions): UseFileDragAndDropReturn => {
    const [isDragOver, setIsDragOver] = useState(false);
    const dropZoneRef = useRef<HTMLDivElement>(null);
    const dragCounter = useRef(0);

    const isValidFileType = useCallback((file: File): boolean => {
        if (!accept) return true;

        const acceptedTypes = accept.split(',').map(type => type.trim());

        return acceptedTypes.some(type => {
            if (type.startsWith('.')) {
                // Estensione file (es. ".pdf", ".jpg")
                return file.name.toLowerCase().endsWith(type.toLowerCase());
            } else if (type.includes('*')) {
                // MIME type con wildcard (es. "image/*", "video/*")
                const baseType = type.split('/')[0];
                const fileBaseType = file.type.split('/')[0];
                return fileBaseType === baseType;
            } else {
                // MIME type specifico (es. "image/jpeg", "application/pdf")
                return file.type === type;
            }
        });
    }, [accept]);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (disabled) return;

        dragCounter.current++;
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragOver(true);
        }
    }, [disabled]);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (disabled) return;

        dragCounter.current--;
        if (dragCounter.current === 0) {
            setIsDragOver(false);
        }
    }, [disabled]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (disabled) return;

        e.dataTransfer.dropEffect = 'copy';
    }, [disabled]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (disabled) return;

        setIsDragOver(false);
        dragCounter.current = 0;

        // Usa direttamente dataTransfer.files (funziona ovunque)
        const droppedFiles = Array.from(e.dataTransfer.files);

        if (droppedFiles.length === 0) return;

        // Filtra i file in base al tipo accettato
        const validFiles = droppedFiles.filter(file => isValidFileType(file));

        if (validFiles.length === 0) return;

        // Se multiple è false, prendi solo il primo file
        const filesToProcess = multiple ? validFiles : [validFiles[0]];

        onFilesDropped(filesToProcess);
    }, [disabled, multiple, isValidFileType, onFilesDropped]);

    return {
        isDragOver,
        dragProps: {
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDragOver: handleDragOver,
            onDrop: handleDrop
        },
        dropZoneRef
    };
};
