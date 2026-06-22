package test.check.inspections.data

import okhttp3.MultipartBody
import retrofit2.http.*

interface Api {
    @POST("auth/login")
    suspend fun login(@Body body: LoginBody): LoginResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshBody): LoginResponse

    @GET("agenda")
    suspend fun agenda(@Query("date") date: String): List<InspectionSummary>

    @GET("inspections")
    suspend fun inspections(): List<InspectionSummary>

    @GET("inspections/{id}")
    suspend fun inspection(@Path("id") id: String): InspectionDetail

    @PATCH("items/{id}")
    suspend fun updateItem(@Path("id") id: String, @Body body: UpdateItemBody)

    @POST("inspections/{id}/sign")
    suspend fun sign(@Path("id") id: String, @Body body: SignBody)

    @Multipart
    @POST("items/{id}/photos")
    suspend fun uploadPhoto(@Path("id") id: String, @Part file: MultipartBody.Part)

    @DELETE("photos/{id}")
    suspend fun deletePhoto(@Path("id") id: String)

    @PATCH("photos/{id}")
    suspend fun updatePhotoNote(@Path("id") id: String, @Body body: UpdatePhotoBody)

    @POST("inspections/{id}/rooms")
    suspend fun addRoom(@Path("id") id: String, @Body body: AddRoomBody)

    @POST("rooms/{id}/items")
    suspend fun addCheck(@Path("id") roomId: String, @Body body: AddItemBody)

    // Staff (ADMIN / MANAGER)
    @GET("users")
    suspend fun users(): List<UserRef>

    @POST("inspections/draft")
    suspend fun createDraft(@Body body: CreateDraftBody): CreatedRef

    @POST("inspections/{id}/assign")
    suspend fun assignTeam(@Path("id") id: String, @Body body: AssignTeamBody)

    @POST("users")
    suspend fun createUser(@Body body: CreateUserBody)
}
