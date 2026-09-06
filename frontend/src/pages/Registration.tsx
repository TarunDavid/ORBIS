import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

const Registration = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    school_name: '',
    grade: 'Grade 5',
    mentor_name: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post('students/', formData);
      localStorage.setItem('student_id', response.data.id);
      localStorage.setItem('student_name', response.data.name);
      localStorage.setItem('student_grade', response.data.grade);
      localStorage.setItem('currentStudent', JSON.stringify(response.data));
      navigate('/dashboard');
    } catch (error) {
      console.error('Registration failed', error);
      alert('Failed to register. Please ensure backend is running.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
      <div className="bg-white/90 backdrop-blur-sm p-8 rounded-2xl shadow-2xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-center text-slate-800 mb-2">ORBIS</h1>
        <p className="text-center text-slate-500 mb-8">Let's get started on your learning journey!</p>
        
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
            <input required type="text" name="name" value={formData.name} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="John Doe" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Age</label>
            <input required type="number" name="age" value={formData.age} onChange={handleChange} min="4" max="20" className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="10" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">School Name</label>
            <input required type="text" name="school_name" value={formData.school_name} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Springfield Elementary" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Grade</label>
            <select required name="grade" value={formData.grade} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition bg-white">
              <option value="Grade 1">Grade 1</option>
              <option value="Grade 2">Grade 2</option>
              <option value="Grade 3">Grade 3</option>
              <option value="Grade 4">Grade 4</option>
              <option value="Grade 5">Grade 5</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Mentor Name</label>
            <input required type="text" name="mentor_name" value={formData.mentor_name} onChange={handleChange} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none transition" placeholder="Mr. Smith" />
          </div>
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 rounded-lg transition shadow-lg hover:shadow-xl">
            Start Exploring
          </button>
        </form>
      </div>
    </div>
  );
};

export default Registration;
