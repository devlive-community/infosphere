package org.devlive.infosphere.service.repository;

import org.devlive.infosphere.service.entity.UserEntity;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.repository.query.Param;

import javax.transaction.Transactional;

import java.util.List;
import java.util.Optional;

@Transactional
public interface UserRepository
        extends CrudRepository<UserEntity, Long>
{
    /**
     * 根据用户名称查找用户
     *
     * @param username 用户名
     * @return 用户信息
     */
    Optional<UserEntity> findByUsername(String username);

    /**
     * 根据文章数量查询用户排行榜
     *
     * @return 用户排行榜
     */
    @Query(value = "SELECT DISTINCT(uar.uar_user_id), COUNT(uar.uar_user_id) AS u_count, u.u_id, u.u_username, u.u_password, u.u_avatar, u.u_alias_name, u.u_signature, u.u_email, u_active, u_lock, utr.utr_users_type_id " +
            "FROM users_article_relation AS uar " +
            "LEFT JOIN users AS u ON uar.uar_user_id = u.u_id " +
            "LEFT OUTER JOIN users_type_relation AS utr ON uar.uar_user_id = utr.utr_users_id " +
            "GROUP BY uar.uar_user_id, utr.utr_users_type_id " +
            "ORDER BY u_count DESC LIMIT 5",
            nativeQuery = true)
    List<UserEntity> findTopByArticle();

    /**
     * 查询用户所有的关注者
     *
     * @param userId 需要查询的用户
     * @return 该用户关注者列表
     */
    @Query(value = "SELECT u.u_id, u.u_username, u.u_password, u.u_avatar, u.u_alias_name, u.u_signature " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u " +
            "ON ufr.ufr_user_id_cover = u.u_id " +
            "WHERE ufr.ufr_user_id_follw = ?1",
            nativeQuery = true)
    List<UserEntity> findAllFollowersByUserId(Long userId);

    /**
     * 查询关注该用户的所有用户
     *
     * @param userId 需要查询的用户
     * @return 关注者该用户列表
     */
    @Query(value = "SELECT u.u_id, u.u_username, u.u_password, u.u_avatar, u.u_alias_name, u.u_signature " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u " +
            "ON ufr.ufr_user_id_follw = u.u_id " +
            "WHERE ufr.ufr_user_id_cover = ?1",
            nativeQuery = true)
    List<UserEntity> findAllCoversByUserId(Long userId);

    /**
     * 查询当前用户是否被关注过
     *
     * @param followUserId 关注者用户id
     * @param coverUserId 被关注者用户id
     * @return 用户信息
     */
    @Query(value = "SELECT u.u_id, u.u_username, u.u_password, u.u_avatar, u.u_alias_name, u.u_signature, u.u_active, u.u_email, u.u_lock, utr.utr_users_type_id " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u ON ufr.ufr_user_id_follw = u.u_id " +
            "LEFT JOIN users_type_relation AS utr ON utr.utr_users_type_id = u.u_id " +
            "WHERE u.u_id = ?1 " +
            "AND ufr.ufr_user_id_cover = ?2", nativeQuery = true)
    UserEntity findUserEntityByFollowsExists(Long followUserId, Long coverUserId);

    /**
     * 关注用户
     *
     * @param followUserId 关注者用户id
     * @param coverUserId 被关注者用户id
     * @return 状态
     */
    @Modifying
    @Query(value = "INSERT INTO users_follow_relation(ufr_user_id_follw, ufr_user_id_cover) " +
            "VALUE(?1, ?2)",
            nativeQuery = true)
    Integer follow(Long followUserId, Long coverUserId);

    /**
     * 取消关注用户
     *
     * @param followUserId 关注者用户id
     * @param coverUserId 被关注者用户id
     * @return 状态
     */
    @Modifying
    @Query(value = "DELETE FROM users_follow_relation " +
            "WHERE ufr_user_id_follw = ?1 " +
            "AND ufr_user_id_cover = ?2",
            nativeQuery = true)
    Integer unFollow(Long followUserId, Long coverUserId);

    /**
     * 关注者关注用户总数
     *
     * @param followUserId 关注者用户id
     * @return 关注总数
     */
    @Query(value = "SELECT count(u.u_id)AS count " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u " +
            "ON ufr.ufr_user_id_follw = u.u_id " +
            "WHERE ufr.ufr_user_id_follw = ?1",
            nativeQuery = true)
    Integer findFollowCount(Long followUserId);

    /**
     * 查询关注的用户
     *
     * @param followUserId
     * @return
     */
    @Query(value = "SELECT * " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u " +
            "ON ufr.ufr_user_id_cover = u.u_id " +
            "WHERE ufr.ufr_user_id_follw = ?1",
            nativeQuery = true)
    List<UserEntity> findUserFollowed(Long followUserId);

    /**
     * 关注者被关注用户总数
     *
     * @param followUserId 关注者用户id
     * @return 关注总数
     */
    @Query(value = "SELECT count(u.u_id)AS count " +
            "FROM users_follow_relation AS ufr " +
            "LEFT JOIN users AS u " +
            "ON ufr.ufr_user_id_cover = u.u_id " +
            "WHERE ufr.ufr_user_id_cover = ?1",
            nativeQuery = true)
    Integer findFollowCoverCount(Long followUserId);

    /**
     * 根据邮箱查询用户
     *
     * @param email 邮箱
     * @return 用户信息
     */
    Optional<UserEntity> findByEmail(String email);

    /**
     * 修改邮箱
     *
     * @param id 用户标识
     * @param email 邮箱
     * @return
     */
    @Modifying
    @Query(value = "update UserEntity as users " +
            "set users.email = :email " +
            "where users.id = :id")
    Integer updateByEmail(@Param(value = "id") Long id,
            @Param(value = "email") String email);

    /**
     * 修改密码
     *
     * @param id 用户标识
     * @param password 密码
     * @return
     */
    @Modifying
    @Query(value = "update UserEntity as users " +
            "set users.password = :password " +
            "where users.id = :id")
    Integer updateByPassword(@Param(value = "id") Long id,
            @Param(value = "password") String password);
}
