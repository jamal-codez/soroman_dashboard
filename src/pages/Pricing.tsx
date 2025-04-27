import { useState } from 'react';
import { SidebarNav } from '@/components/SidebarNav';
import { TopBar } from '@/components/TopBar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Plus, Edit, Power, Info } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface State {
  id: string;
  name: string;
  status: 'Active' | 'Suspended';
  products: Product[];
}

const initialStates: State[] = [
  {
    id: '1',
    name: 'Lagos State',
    status: 'Active',
    products: [
      {
        id: 'p1',
        name: 'Petrol (PMS)',
        description: 'Premium Motor Spirit',
        price: 650.00
      },
      {
        id: 'p2',
        name: 'Diesel (AGO)',
        description: 'Automotive Gas Oil',
        price: 720.50
      },
      {
        id: 'p3',
        name: 'LPG',
        description: 'Liquefied Petroleum Gas',
        price: 950.75
      }
    ]
  },
  {
    id: '2',
    name: 'Abuja FCT',
    status: 'Active',
    products: [
      {
        id: 'p4',
        name: 'Petrol (PMS)',
        description: 'Premium Motor Spirit',
        price: 660.00
      },
      {
        id: 'p5',
        name: 'Diesel (AGO)',
        description: 'Automotive Gas Oil',
        price: 730.00
      }
    ]
  },
];

const Pricing = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [states, setStates] = useState(initialStates);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingState, setEditingState] = useState<State | null>(null);
  const [tempPrices, setTempPrices] = useState<{ [key: string]: number }>({});
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductPrice, setNewProductPrice] = useState<number | ''>('');

  const filteredStates = states.filter(state => 
    state.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    state.products.some(product => 
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );
  
  const handleSavePrices = () => {
    if (!editingState) return;

    const updatedStates = states.map(state => {
      if (state.id === editingState.id) {
        return {
          ...state,
          products: state.products.map(product => ({
            ...product,
            price: tempPrices[product.id] || product.price
          }))
        };
      }
      return state;
    });

    setStates(updatedStates);
    setIsModalOpen(false);
    setEditingState(null);
    setTempPrices({});
  };

  const toggleStateStatus = (stateId: string) => {
    setStates(states.map(state => 
      state.id === stateId ? { 
        ...state, 
        status: state.status === 'Active' ? 'Suspended' : 'Active' 
      } : state
    ));
  };

  const handleAddProduct = () => {
    if (!editingState || !newProductName || !newProductDescription || newProductPrice === '') return;

    const newProduct: Product = {
      id: `p${Date.now()}`, // Generate a unique ID
      name: newProductName,
      description: newProductDescription,
      price: newProductPrice
    };

    const updatedStates = states.map(state => {
      if (state.id === editingState.id) {
        return {
          ...state,
          products: [...state.products, newProduct]
        };
      }
      return state;
    });

    setStates(updatedStates);
    setIsAddProductModalOpen(false);
    setNewProductName('');
    setNewProductDescription('');
    setNewProductPrice('');
  };

  return (
    <div className="flex h-screen bg-slate-100">
      <SidebarNav />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        
        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h1 className="text-2xl font-bold text-slate-800">State Pricing Dashboard</h1>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add State
              </Button>
            </div>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <Input
                  type="text"
                  placeholder="Search states or products..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredStates.map(state => (
                <div key={state.id} className="bg-white rounded-lg shadow-sm border border-slate-200">
                  <div className="p-4 border-b flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">{state.name}</h3>
                      <span className={`text-sm px-2 py-1 rounded-full ${
                        state.status === 'Active' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {state.status}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className={state.status === 'Active' 
                        ? 'text-red-600 hover:bg-red-50' 
                        : 'text-green-600 hover:bg-green-50'}
                      onClick={() => toggleStateStatus(state.id)}
                    >
                      <Power className="mr-2 h-4 w-4" />
                      {state.status === 'Active' ? 'Suspend State' : 'Activate State'}
                    </Button>
                  </div>
                  
                  <div className="p-4 space-y-4">
                    {state.products.map(product => (
                      <div key={product.id} className="border-b pb-4 last:border-b-0">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium text-slate-800">{product.name}</h4>
                            <p className="text-sm text-slate-600">{product.description}</p>
                          </div>
                          <div className="flex items-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-600 hover:bg-slate-100"
                              onClick={() => {
                                setEditingState(state);
                                setTempPrices({ ...tempPrices, [product.id]: product.price });
                              }}
                            >
                              <Edit className="mr-2 h-4 w-4" />₦{product.price.toLocaleString()}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-slate-600 hover:bg-slate-100 ml-2"
                              onClick={() => {
                                setEditingState(state);
                                setIsAddProductModalOpen(true);
                              }}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {filteredStates.length === 0 && (
              <div className="p-8 text-center text-slate-500">
                {searchQuery.trim() ? 
                  'No states or products found matching your search criteria.' : 
                  'No states available. Start by adding a new state.'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Price Edit Modal */}
      {editingState && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Info className="h-5 w-5" />
              Edit Prices for {editingState.name}
            </h2>
            <div className="space-y-4">
              {editingState.products.map(product => (
                <div key={product.id} className="flex items-center gap-4">
                  <div className="flex-1">
                    <h4 className="font-medium">{product.name}</h4>
                    <p className="text-sm text-slate-600">{product.description}</p>
                  </div>
                  <Input
                    type="number"
                    value={tempPrices[product.id] || product.price}
                    onChange={(e) => setTempPrices({
                      ...tempPrices,
                      [product.id]: parseFloat(e.target.value)
                    })}
                    className="w-32"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => {
                setEditingState(null);
                setIsModalOpen(false);
              }}>
                Cancel
              </Button>
              <Button onClick={handleSavePrices}>
                Save All Changes
              </Button>
            </div>
          </div>
        </div>
      )}

      {isAddProductModalOpen && editingState && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Product to {editingState.name}
            </h2>
            <div className="space-y-4">
              <Input
                type="text"
                placeholder="Product Name"
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="w-full"
              />
              <Input
                type="text"
                placeholder="Product Description"
                value={newProductDescription}
                onChange={(e) => setNewProductDescription(e.target.value)}
                className="w-full"
              />
              <Input
                type="number"
                placeholder="Product Price"
                value={newProductPrice}
                onChange={(e) => setNewProductPrice(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" onClick={() => setIsAddProductModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddProduct}>
                Add Product
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Pricing;