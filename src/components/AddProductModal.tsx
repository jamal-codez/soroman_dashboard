import React, { useState } from 'react';
import { apiClient } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Modal from '@/components/ui/modal';
import { useToast } from '@/hooks/use-toast';

const AddProductModal = ({ isOpen, onClose, onProductAdded }) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: '',
    unit_price: '',
    stock_quantity: '',
    abbreviation: '',
    description: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const newProduct = {
        name: formData.name,
        unit_price: parseFloat(formData.unit_price),
        stock_quantity: parseInt(formData.stock_quantity, 10),
        abbreviation: formData.abbreviation,
        description: formData.description
      };
      
      await apiClient.admin.adminCreateProduct(newProduct);
      toast({
        title: "Success!",
        description: "Product created successfully",
      });
      
      // Reset form and close modal
      setFormData({
        name: '',
        unit_price: '',
        stock_quantity: '',
        abbreviation: '',
        description: ''
      });
      onProductAdded();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: error.message || "Failed to create product",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">Add New Product</h2>
        
        <Input
          name="name"
          placeholder="Product Name"
          value={formData.name}
          onChange={handleChange}
        />
        <Input
          name="unit_price"
          placeholder="Unit Price"
          type="number"
          value={formData.unit_price}
          onChange={handleChange}
        />
        <Input
          name="stock_quantity"
          placeholder="Stock Quantity"
          type="number"
          value={formData.stock_quantity}
          onChange={handleChange}
        />
        <Input
          name="abbreviation"
          placeholder="Abbreviation"
          value={formData.abbreviation}
          onChange={handleChange}
        />
        <Input
          name="description"
          placeholder="Description"
          value={formData.description}
          onChange={handleChange}
        />
        
        <Button 
          onClick={handleSubmit}
          disabled={isLoading}
        >
          {isLoading ? 'Creating...' : 'Create Product'}
        </Button>
      </div>
    </Modal>
  );
};

export default AddProductModal;