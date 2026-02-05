import React from 'react';
import { X, Mail, Phone, Calendar, DollarSign, ShoppingBag, Package, Layers, TrendingUp, MapPin, User, Brain } from 'lucide-react';
import { EnrichedProfile } from '../types';

interface ProfileDetailDrawerProps {
  profile: EnrichedProfile | null;
  onClose: () => void;
}

export const ProfileDetailDrawer: React.FC<ProfileDetailDrawerProps> = ({ profile, onClose }) => {
  if (!profile) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {profile.first_name || profile.last_name
                ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim()
                : 'Customer Profile'}
            </h2>
            <p className="text-sm text-gray-500">{profile.email}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Source Badge */}
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-sm font-medium rounded-full">
              {profile._spoke_name}
            </span>
            {profile.order_stats && profile.order_stats.ltv >= 50 && (
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-sm font-medium rounded-full">
                VIP Customer
              </span>
            )}
          </div>

          {/* Contact Info */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Contact</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-gray-900">{profile.email}</span>
              </div>
              {profile.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-900">{profile.phone}</span>
                </div>
              )}
              {profile.created_at && (
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600">Customer since {new Date(profile.created_at).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Address Info */}
          {(profile.billing_address?.city || profile.shipping_address?.city) && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Location</h3>
              <div className="space-y-3">
                {profile.billing_address && (profile.billing_address.city || profile.billing_address.state) && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Billing</p>
                      <p className="text-gray-900">
                        {[
                          profile.billing_address.address,
                          profile.billing_address.city,
                          profile.billing_address.state,
                          profile.billing_address.zip
                        ].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
                {profile.shipping_address && (profile.shipping_address.city || profile.shipping_address.state) && (
                  <div className="flex items-start gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Shipping</p>
                      <p className="text-gray-900">
                        {[
                          profile.shipping_address.address,
                          profile.shipping_address.city,
                          profile.shipping_address.state,
                          profile.shipping_address.zip
                        ].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Demographics */}
          {profile._predicted_demographics && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Predicted Demographics
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {/* Gender */}
                <div className="flex items-start gap-2">
                  <User className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 capitalize">
                      {profile._predicted_demographics.gender.gender}
                    </p>
                    <p className="text-xs text-gray-500">
                      {profile._predicted_demographics.gender.confidence} confidence
                      {profile._predicted_demographics.gender.origin && (
                        <span className="text-gray-400"> • {profile._predicted_demographics.gender.origin}</span>
                      )}
                    </p>
                  </div>
                </div>

                {/* Age */}
                <div className="flex items-start gap-2">
                  <Brain className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {profile._predicted_demographics.age.age_range === 'unknown'
                        ? 'Unknown'
                        : `${profile._predicted_demographics.age.age_range} years`}
                    </p>
                    <p className="text-xs text-gray-500">
                      {profile._predicted_demographics.age.confidence} confidence
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Order Stats */}
          {profile.order_stats && profile.order_stats.order_count > 0 ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-emerald-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-emerald-600 mb-1">
                    <DollarSign className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Lifetime Value</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">
                    ${profile.order_stats.ltv.toFixed(2)}
                  </p>
                </div>

                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-1">
                    <ShoppingBag className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Orders</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-700">
                    {profile.order_stats.order_count}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Avg Order</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-700">
                    ${profile.order_stats.avg_order_value.toFixed(2)}
                  </p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-gray-600 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-semibold uppercase">Last Order</span>
                  </div>
                  <p className="text-lg font-bold text-gray-700">
                    {profile.order_stats.last_purchase_at
                      ? new Date(profile.order_stats.last_purchase_at).toLocaleDateString()
                      : '—'}
                  </p>
                </div>
              </div>

              {/* Products Purchased */}
              {profile.order_stats.products_purchased && profile.order_stats.products_purchased.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-600" />
                    Products Purchased ({profile.order_stats.products_purchased.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {profile.order_stats.products_purchased.map((product, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between bg-white border border-gray-100 rounded-lg px-4 py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {product.product_name}
                          </p>
                          <p className="text-xs text-gray-500">
                            Qty: {product.total_quantity}
                            {product.last_purchased_at && (
                              <> • Last: {new Date(product.last_purchased_at).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                        <div className="text-right ml-4">
                          <p className="text-sm font-semibold text-gray-900">
                            ${product.total_spent.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl p-6 text-center">
              <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-gray-500">No purchase history</p>
            </div>
          )}

          {/* Marketing Actions */}
          <div className="border-t border-gray-100 pt-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Quick Actions
            </h3>
            <div className="flex flex-wrap gap-2">
              <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors">
                Send Email
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Add to Segment
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                View Orders
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
