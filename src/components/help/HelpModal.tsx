import React, { useState, useMemo } from 'react';
import { X, Search, Book, Video, ChevronRight } from 'lucide-react';
import { helpArticles, faqItems, categories } from '../../data/helpContent';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPage?: string;
}

export default function HelpModal({ isOpen, onClose, currentPage }: HelpModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'articles' | 'faq'>('articles');

  const filteredArticles = useMemo(() => {
    let filtered = helpArticles;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(article =>
        article.title.toLowerCase().includes(query) ||
        article.content.toLowerCase().includes(query) ||
        article.keywords?.some(k => k.toLowerCase().includes(query))
      );
    }

    if (selectedCategory) {
      filtered = filtered.filter(article => article.category === selectedCategory);
    }

    return filtered;
  }, [searchQuery, selectedCategory]);

  const relevantArticles = useMemo(() => {
    if (!currentPage) return [];
    return helpArticles.filter(article =>
      article.relatedPages?.includes(currentPage)
    ).slice(0, 3);
  }, [currentPage]);

  if (!isOpen) return null;

  const article = helpArticles.find(a => a.id === selectedArticle);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b bg-gradient-to-r from-neon-50 via-agri-gold-50 to-neon-100 border-neon-200">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-neon-400 to-neon-500 rounded-2xl flex items-center justify-center shadow-lg shadow-neon-500/30">
              <Book className="w-6 h-6 text-agri-brown-900" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-agri-brown-900">Help Center</h2>
              <p className="text-sm text-agri-brown-600">Find answers and learn features</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/60 rounded-lg transition-colors"
          >
            <X className="w-6 h-6 text-agri-brown-700" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!selectedArticle ? (
            <>
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search help articles..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-gray-300 rounded-xl text-gray-900 focus:ring-2 focus:ring-neon-400 focus:border-neon-300 transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-2 mb-6 border-b">
                <button
                  onClick={() => setActiveTab('articles')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'articles'
                      ? 'text-agri-brown-900 border-b-2 border-neon-500'
                      : 'text-gray-600 hover:text-agri-brown-900'
                  }`}
                >
                  Articles
                </button>
                <button
                  onClick={() => setActiveTab('faq')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    activeTab === 'faq'
                      ? 'text-agri-brown-900 border-b-2 border-neon-500'
                      : 'text-gray-600 hover:text-agri-brown-900'
                  }`}
                >
                  FAQ
                </button>
              </div>

              {activeTab === 'articles' ? (
                <>
                  {relevantArticles.length > 0 && !searchQuery && (
                    <div className="mb-6">
                      <h3 className="font-bold text-lg mb-3 flex items-center gap-2 text-agri-brown-900">
                        <span className="text-neon-500">📍</span>
                        Relevant to this page
                      </h3>
                      <div className="space-y-2">
                        {relevantArticles.map(article => (
                          <button
                            key={article.id}
                            onClick={() => setSelectedArticle(article.id)}
                            className="w-full text-left p-4 bg-gradient-to-r from-neon-50 to-agri-gold-50 hover:from-neon-100 hover:to-agri-gold-100 rounded-xl transition-all duration-200 border border-neon-200 hover:border-neon-300 hover:shadow-md"
                          >
                            <h4 className="font-semibold text-agri-brown-900">{article.title}</h4>
                            <p className="text-sm text-agri-brown-700 mt-1">{article.content}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mb-6">
                    <h3 className="font-bold text-lg mb-3">Categories</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedCategory(null)}
                        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                          !selectedCategory
                            ? 'bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 shadow-md shadow-neon-500/30'
                            : 'bg-agri-brown-50 text-agri-brown-700 hover:bg-agri-brown-100 border border-agri-brown-200'
                        }`}
                      >
                        All
                      </button>
                      {categories.map(category => (
                        <button
                          key={category}
                          onClick={() => setSelectedCategory(category)}
                          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                            selectedCategory === category
                              ? 'bg-gradient-to-r from-neon-400 to-neon-500 text-agri-brown-900 shadow-md shadow-neon-500/30'
                              : 'bg-agri-brown-50 text-agri-brown-700 hover:bg-agri-brown-100 border border-agri-brown-200'
                          }`}
                        >
                          {category}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredArticles.map(article => (
                      <button
                        key={article.id}
                        onClick={() => setSelectedArticle(article.id)}
                        className="w-full text-left p-4 border border-agri-brown-200 hover:border-neon-400 hover:bg-gradient-to-r hover:from-neon-50 hover:to-agri-gold-50 rounded-xl transition-all duration-200 group shadow-sm hover:shadow-md"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Book className="w-4 h-4 text-neon-600" />
                              <span className="text-xs font-medium text-neon-600 bg-neon-100 px-2 py-0.5 rounded-full">
                                {article.category}
                              </span>
                            </div>
                            <h4 className="font-semibold text-agri-brown-900 group-hover:text-neon-600 flex items-center gap-2">
                              {article.title}
                              <ChevronRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity text-neon-500" />
                            </h4>
                            <p className="text-sm text-gray-600 mt-1 line-clamp-2">{article.content}</p>
                          </div>
                          {article.videoUrl && (
                            <Video className="w-5 h-5 text-gray-400 ml-2" />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {filteredArticles.length === 0 && (
                    <div className="text-center py-12">
                      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search className="w-8 h-8 text-gray-400" />
                      </div>
                      <p className="text-gray-500">No articles found. Try a different search.</p>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  {faqItems.map((faq, index) => (
                    <div key={index} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <h4 className="font-semibold text-gray-900 mb-2">{faq.question}</h4>
                      <p className="text-gray-600">{faq.answer}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <button
                onClick={() => setSelectedArticle(null)}
                className="text-neon-600 hover:text-neon-700 font-medium mb-4 flex items-center gap-1 transition-colors"
              >
                ← Back to articles
              </button>

              <div className="mb-4">
                <span className="text-sm font-medium text-neon-600 bg-gradient-to-r from-neon-100 to-agri-gold-100 px-3 py-1 rounded-full border border-neon-200">
                  {article?.category}
                </span>
                <h2 className="text-3xl font-bold mt-3 text-agri-brown-900">{article?.title}</h2>
              </div>

              <p className="text-agri-brown-700 mb-6 text-lg leading-relaxed">{article?.content}</p>

              {article?.videoUrl && (
                <div className="mb-6">
                  <div className="aspect-video bg-gradient-to-br from-neon-100 via-agri-gold-100 to-neon-50 rounded-xl flex items-center justify-center border-2 border-neon-200 shadow-lg">
                    <Video className="w-12 h-12 text-neon-600" />
                    <p className="ml-3 text-agri-brown-700 font-medium">Video tutorial coming soon</p>
                  </div>
                </div>
              )}

              {article?.steps && (
                <div className="mb-6">
                  <h3 className="font-bold text-xl mb-4 text-agri-brown-900">Step-by-Step Guide:</h3>
                  <div className="space-y-4">
                    {article.steps.map((step, index) => (
                      <div key={index} className="flex gap-4">
                        <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-neon-400 to-neon-500 text-agri-brown-900 rounded-full flex items-center justify-center font-bold text-sm shadow-md shadow-neon-500/30">
                          {index + 1}
                        </div>
                        <p className="flex-1 pt-1 text-agri-brown-700 leading-relaxed">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {article?.relatedPages && (
                <div className="bg-gradient-to-r from-neon-50 via-agri-gold-50 to-neon-50 rounded-xl p-4 border-2 border-neon-200 shadow-sm">
                  <h4 className="font-semibold mb-2 text-agri-brown-900">Related Pages:</h4>
                  <div className="flex flex-wrap gap-2">
                    {article.relatedPages.map(page => (
                      <span key={page} className="px-3 py-1 bg-white rounded-full text-sm border border-neon-200 text-agri-brown-700 shadow-sm">
                        {page}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-neon-200 p-4 bg-gradient-to-r from-neon-50 to-agri-gold-50">
          <p className="text-sm text-agri-brown-600 text-center">
            Still need help? Contact support: <span className="font-medium text-neon-600 hover:text-neon-700 transition-colors">support@edentrack.app</span>
          </p>
        </div>
      </div>
    </div>
  );
}
