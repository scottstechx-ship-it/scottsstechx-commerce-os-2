package com.scottstechx.commerceos.ui.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.scottstechx.commerceos.data.ScottsTechXRepository
import com.scottstechx.commerceos.data.auth.Role
import com.scottstechx.commerceos.data.remote.ApiResult
import com.scottstechx.commerceos.data.remote.dto.RegisterRequest
import com.scottstechx.commerceos.security.InputValidator
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class RegistrationUiState(
    val fullName: String = "",
    val phone: String = "",
    val password: String = "",
    val role: Role = Role.BUYER,
    val businessName: String = "",
    val isSubmitting: Boolean = false,
    val error: String? = null,
    val success: Boolean = false
)

@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val repository: ScottsTechXRepository
) : ViewModel() {

    private val _state = MutableStateFlow(RegistrationUiState())
    val state: StateFlow<RegistrationUiState> = _state.asStateFlow()

    fun onFullNameChange(v: String) = _state.update { it.copy(fullName = v, error = null) }
    fun onPhoneChange(v: String) = _state.update { it.copy(phone = v, error = null) }
    fun onPasswordChange(v: String) = _state.update { it.copy(password = v, error = null) }
    fun onRoleChange(r: Role) = _state.update { it.copy(role = r, error = null) }
    fun onBusinessNameChange(v: String) = _state.update { it.copy(businessName = v, error = null) }

    fun submit() {
        val current = _state.value
        if (current.fullName.isBlank() || current.phone.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(error = "All fields are required") }
            return
        }
        
        val phoneCheck = InputValidator.validatePhone(current.phone.trim())
        if (phoneCheck is InputValidator.Result.Invalid) {
            _state.update { it.copy(error = phoneCheck.reason) }
            return
        }

        if (current.role == Role.SELLER && current.businessName.isBlank()) {
            _state.update { it.copy(error = "Business name is required for sellers") }
            return
        }

        if (current.isSubmitting) return
        _state.update { it.copy(isSubmitting = true, error = null) }

        viewModelScope.launch {
            val req = RegisterRequest(
                fullName = current.fullName.trim(),
                phone = current.phone.trim(),
                password = current.password,
                role = current.role.name,
                businessName = if (current.role == Role.SELLER) current.businessName.trim() else null
            )
            
            when (val res = repository.register(req)) {
                is ApiResult.Success -> {
                    _state.update { it.copy(isSubmitting = false, success = true) }
                }
                is ApiResult.HttpError -> {
                    val msg = res.message ?: "Server error (${res.code})"
                    _state.update { it.copy(isSubmitting = false, error = msg) }
                }
                is ApiResult.NetworkError -> {
                    _state.update { it.copy(isSubmitting = false, error = "Network error. Please check your connection.") }
                }
            }
        }
    }

    fun clearError() = _state.update { it.copy(error = null) }
}
