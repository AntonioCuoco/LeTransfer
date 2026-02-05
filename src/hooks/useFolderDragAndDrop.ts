import { useState, useCallback, useRef } from 'react';
import Swal from 'sweetalert2';

interface UseFolderDragAndDropOptions {
    onFilesDropped: (files: File[]) => void;
    accept?: string;
    multiple?: boolean;
    disabled?: boolean;
}

interface UseFolderDragAndDropReturn {
    isDragOver: boolean;
    supportsFolderDnD: boolean;
    dragProps: {
        onDragEnter: (e: React.DragEvent) => void;
        onDragLeave: (e: React.DragEvent) => void;
        onDragOver: (e: React.DragEvent) => void;
        onDrop: (e: React.DragEvent) => void;
    };
    dropZoneRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook per gestire il drag & drop di cartelle.
 * Supporta traversamento ricorsivo delle directory.
 * Mostra popup se browser non supporta folder D&D.
 */
export const useFolderDragAndDrop = ({
    onFilesDropped,
    accept,
    multiple = true,
    disabled = false
}: UseFolderDragAndDropOptions): UseFolderDragAndDropReturn => {
    const [isDragOver, setIsDragOver] = useState(false);
    const dropZoneRef = useRef<HTMLDivElement>(null);
    const dragCounter = useRef(0);

    // Check for Folder Drag & Drop support
    const supportsFolderDnD =
        'DataTransferItem' in window &&
        'webkitGetAsEntry' in DataTransferItem.prototype;

    const isValidFileType = useCallback((file: File): boolean => {
        if (!accept) return true;

        const acceptedTypes = accept.split(',').map(type => type.trim());

        return acceptedTypes.some(type => {
            if (type.startsWith('.')) {
                return file.name.toLowerCase().endsWith(type.toLowerCase());
            } else if (type.includes('*')) {
                const baseType = type.split('/')[0];
                const fileBaseType = file.type.split('/')[0];
                return fileBaseType === baseType;
            } else {
                return file.type === type;
            }
        });
    }, [accept]);

    // Funzione ricorsiva per traversare directory
    const traverseFileTree = async (item: FileSystemEntry, path = ''): Promise<File[]> => {
        if (item.isFile) {
            return new Promise((resolve) => {
                (item as FileSystemFileEntry).file((file: File) => {
                    resolve([file]);
                }, () => resolve([])); // Error handler - skip file
            });
        } else if (item.isDirectory) {
            const dirReader = (item as FileSystemDirectoryEntry).createReader();

            // Legge tutte le entries (readEntries può restituire batch parziali)
            const getAllEntries = async (): Promise<FileSystemEntry[]> => {
                let allEntries: FileSystemEntry[] = [];
                let batch: FileSystemEntry[];
                do {
                    batch = await new Promise((resolve, reject) => {
                        dirReader.readEntries(resolve, reject);
                    });
                    if (batch.length > 0) {
                        allEntries = allEntries.concat(batch);
                    }
                } while (batch.length > 0);
                return allEntries;
            };

            try {
                const entries = await getAllEntries();
                const filesPromises = entries.map(entry =>
                    traverseFileTree(entry, path + item.name + "/")
                );
                const filesArrays = await Promise.all(filesPromises);
                return filesArrays.flat();
            } catch (e) {
                console.error("Error reading directory", e);
                return [];
            }
        }
        return [];
    };

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

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();

        if (disabled) return;

        setIsDragOver(false);
        dragCounter.current = 0;

        // Se browser non supporta folder D&D, mostra popup
        if (!supportsFolderDnD) {
            Swal.fire({
                icon: 'info',
                title: 'Browser non supportato',
                text: "Questo browser non supporta il drag & drop delle cartelle. Nessun problema: usa il pulsante 'Sfoglia Cartella' 🙂",
                confirmButtonColor: '#724CF9'
            });
            return;
        }

        const items = e.dataTransfer.items;
        let files: File[] = [];

        if (items && items.length > 0) {
            const promises: Promise<File[]>[] = [];
            for (let i = 0; i < items.length; i++) {
                const entry = items[i].webkitGetAsEntry();
                if (entry) {
                    promises.push(traverseFileTree(entry));
                }
            }
            const filesArrays = await Promise.all(promises);
            files = filesArrays.flat();
        }

        if (files.length === 0) return;

        // Filtra i file in base al tipo accettato
        const validFiles = files.filter(file => isValidFileType(file));

        if (validFiles.length === 0) return;

        // Se multiple è false, prendi solo il primo file
        const filesToProcess = multiple ? validFiles : [validFiles[0]];

        onFilesDropped(filesToProcess);
    }, [disabled, multiple, isValidFileType, onFilesDropped, supportsFolderDnD]);

    return {
        isDragOver,
        supportsFolderDnD,
        dragProps: {
            onDragEnter: handleDragEnter,
            onDragLeave: handleDragLeave,
            onDragOver: handleDragOver,
            onDrop: handleDrop
        },
        dropZoneRef
    };
};
