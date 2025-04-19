import React from 'react';
import { Button } from '@/components/ui/button';
import Modal from './ui/modal';

const DeleteConfirmationModal = ({ isOpen, onClose, onConfirm, isLoading }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Confirm Deletion</h2>
        <p>Are you sure you want to delete this product?</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isLoading}>
            {isLoading ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default DeleteConfirmationModal;