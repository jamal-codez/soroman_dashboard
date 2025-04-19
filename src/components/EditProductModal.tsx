// src/components/EditProductModal.tsx
import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { useToast } from '@/hooks/use-toast';

const EditProductModal = ({ isOpen, onClose, formData, onChange, onSubmit, isLoading }) => {
  const { toast } = useToast();

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Edit Product</h2>
        
        <Input
          name="name"
          placeholder="Product Name"
          value={formData.name}
          onChange={onChange}
        />
        <Input
          name="unit_price"
          placeholder="Unit Price"
          type="number"
          value={formData.unit_price}
          onChange={onChange}
        />
        <Input
          name="stock_quantity"
          placeholder="Stock Quantity"
          type="number"
          value={formData.stock_quantity}
          onChange={onChange}
        />
        <Input
          name="abbreviation"
          placeholder="Abbreviation"
          value={formData.abbreviation}
          onChange={onChange}
        />
        <Input
          name="description"
          placeholder="Description"
          value={formData.description}
          onChange={onChange}
        />
        
        <Button 
          onClick={onSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Updating...' : 'Update Product'}
        </Button>
      </div>
    </Modal>
  );
};

export default EditProductModal;