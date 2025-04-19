import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { useToast } from '@/hooks/use-toast';

const EditProductModal = ({ isOpen, onClose, formData, onChange, onSubmit, isLoading }) => {
  const { toast } = useToast();

  const handleSubmit = () => {
    onSubmit();
  };

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
          disabled // Disable editing of the price
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
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Close
          </Button>
          <Button 
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? 'Updating...' : 'Update Product'}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default EditProductModal;