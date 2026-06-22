package test.check.inspections.data

import kotlinx.serialization.Serializable

@Serializable
data class AuthUser(val id: String, val name: String, val role: String, val discipline: String? = null)

@Serializable
data class LoginResponse(val accessToken: String, val refreshToken: String, val user: AuthUser)

@Serializable
data class ClientRef(val name: String)

@Serializable
data class PropertyRef(val address: String, val client: ClientRef)

@Serializable
data class InspectorRef(val id: String? = null, val name: String)

@Serializable
data class Assignment(val discipline: String, val status: String, val inspector: InspectorRef)

@Serializable
data class InspectionSummary(
    val id: String,
    val status: String,
    val property: PropertyRef,
    val assignments: List<Assignment> = emptyList(),
    val myStatus: String? = null,
    val issuesCount: Int? = null,
)

@Serializable
data class Photo(val id: String, val url: String, val note: String? = null)

@Serializable
data class Item(
    val id: String,
    val discipline: String,
    val component: String,
    val status: String? = null,
    val note: String? = null,
    val photos: List<Photo> = emptyList(),
)

@Serializable
data class Room(val id: String, val name: String, val items: List<Item> = emptyList())

@Serializable
data class Signature(val id: String, val discipline: String? = null, val isManager: Boolean = false, val imageUrl: String)

@Serializable
data class InspectionDetail(
    val id: String,
    val status: String,
    val property: PropertyRef,
    val assignments: List<Assignment> = emptyList(),
    val rooms: List<Room> = emptyList(),
    val signatures: List<Signature> = emptyList(),
)

@Serializable
data class UserRef(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val discipline: String? = null,
)

@Serializable data class CreatedRef(val id: String)

// Request bodies
@Serializable data class LoginBody(val email: String, val password: String)
@Serializable data class RefreshBody(val refreshToken: String)
@Serializable data class UpdateItemBody(val status: String? = null, val note: String? = null)
@Serializable data class UpdatePhotoBody(val note: String? = null)
@Serializable data class AddRoomBody(val name: String)
@Serializable data class AddItemBody(val component: String, val discipline: String? = null)
@Serializable data class SignBody(val imageData: String)

@Serializable data class CustomerInput(val name: String, val phone: String? = null, val email: String? = null)
@Serializable data class PropertyInput(
    val address: String, val type: String,
    val latitude: Double? = null, val longitude: Double? = null,
)
@Serializable data class CreateDraftBody(
    val customer: CustomerInput, val property: PropertyInput, val type: String,
)
@Serializable data class AssignInput(val discipline: String, val inspectorId: String)
@Serializable data class AssignTeamBody(val scheduledAt: String? = null, val assignments: List<AssignInput>)
@Serializable data class CreateUserBody(
    val name: String, val email: String, val password: String,
    val role: String, val discipline: String? = null,
)
